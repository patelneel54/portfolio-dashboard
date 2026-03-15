import os
import json

from fastapi import HTTPException
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    ResidentKeyRequirement,
    PublicKeyCredentialDescriptor,
    RegistrationCredential,
    AuthenticatorAttestationResponse,
    AuthenticationCredential,
    AuthenticatorAssertionResponse,
)
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes

from database import get_db
from auth import create_token

RP_ID = os.getenv("WEBAUTHN_RP_ID", "localhost")
RP_NAME = os.getenv("WEBAUTHN_RP_NAME", "Portfolio Command Center")
ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "http://localhost:5173")

# Ephemeral challenge store (single-user app)
_current_challenge: dict[str, bytes] = {}


async def webauthn_register_options():
    """Generate registration options for a new credential."""
    # Check for existing credentials to exclude
    exclude = []
    async with get_db() as db:
        rows = await db.execute("SELECT credential_id FROM webauthn_credentials")
        for row in await rows.fetchall():
            exclude.append(
                PublicKeyCredentialDescriptor(
                    id=base64url_to_bytes(row["credential_id"])
                )
            )

    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_name="Portfolio User",
        user_id=b"portfolio-user",
        user_display_name="Portfolio User",
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.PREFERRED,
            resident_key=ResidentKeyRequirement.DISCOURAGED,
        ),
        exclude_credentials=exclude,
    )

    _current_challenge["registration"] = options.challenge
    return json.loads(options_to_json(options))


async def webauthn_register_verify(body: dict):
    """Verify registration response and store credential."""
    challenge = _current_challenge.pop("registration", None)
    if not challenge:
        raise HTTPException(400, "No registration in progress")

    credential_data = body["credential"]

    try:
        credential = RegistrationCredential(
            id=credential_data["id"],
            raw_id=base64url_to_bytes(credential_data["rawId"]),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(
                    credential_data["response"]["clientDataJSON"]
                ),
                attestation_object=base64url_to_bytes(
                    credential_data["response"]["attestationObject"]
                ),
            ),
            authenticator_attachment=None,
        )

        verification = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
        )
    except Exception as e:
        raise HTTPException(400, f"Registration verification failed: {e}")

    cred_id_b64 = bytes_to_base64url(verification.credential_id)
    pub_key_b64 = bytes_to_base64url(verification.credential_public_key)

    async with get_db() as db:
        await db.execute("DELETE FROM webauthn_credentials")
        await db.execute(
            "INSERT INTO webauthn_credentials (credential_id, public_key, sign_count) VALUES (?, ?, ?)",
            (cred_id_b64, pub_key_b64, verification.sign_count),
        )
        await db.commit()

    return {"status": "ok", "credential_id": cred_id_b64}


async def webauthn_auth_options():
    """Generate authentication options for an existing credential."""
    async with get_db() as db:
        rows = await db.execute("SELECT credential_id FROM webauthn_credentials")
        creds = await rows.fetchall()

    if not creds:
        raise HTTPException(400, "No credentials registered")

    allow_credentials = [
        PublicKeyCredentialDescriptor(
            id=base64url_to_bytes(row["credential_id"])
        )
        for row in creds
    ]

    options = generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    _current_challenge["authentication"] = options.challenge
    return json.loads(options_to_json(options))


async def webauthn_auth_verify(body: dict):
    """Verify authentication response and issue JWT."""
    challenge = _current_challenge.pop("authentication", None)
    if not challenge:
        raise HTTPException(400, "No authentication in progress")

    credential_data = body["credential"]
    cred_id = credential_data["id"]

    async with get_db() as db:
        row = await db.execute(
            "SELECT * FROM webauthn_credentials WHERE credential_id = ?",
            (cred_id,),
        )
        cred = await row.fetchone()

    if not cred:
        raise HTTPException(400, "Unknown credential")

    try:
        user_handle_bytes = None
        if credential_data["response"].get("userHandle"):
            user_handle_bytes = base64url_to_bytes(
                credential_data["response"]["userHandle"]
            )

        credential = AuthenticationCredential(
            id=credential_data["id"],
            raw_id=base64url_to_bytes(credential_data["rawId"]),
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(
                    credential_data["response"]["clientDataJSON"]
                ),
                authenticator_data=base64url_to_bytes(
                    credential_data["response"]["authenticatorData"]
                ),
                signature=base64url_to_bytes(
                    credential_data["response"]["signature"]
                ),
                user_handle=user_handle_bytes,
            ),
            authenticator_attachment=None,
        )

        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=base64url_to_bytes(cred["public_key"]),
            credential_current_sign_count=cred["sign_count"],
        )
    except Exception as e:
        raise HTTPException(400, f"Authentication verification failed: {e}")

    async with get_db() as db:
        await db.execute(
            "UPDATE webauthn_credentials SET sign_count = ? WHERE credential_id = ?",
            (verification.new_sign_count, cred_id),
        )
        await db.commit()

    token = create_token()
    return {"token": token}


async def webauthn_delete_credential():
    """Delete all stored WebAuthn credentials."""
    async with get_db() as db:
        await db.execute("DELETE FROM webauthn_credentials")
        await db.commit()
    return {"status": "ok"}


async def webauthn_get_status():
    """Check if a WebAuthn credential is registered."""
    async with get_db() as db:
        row = await db.execute("SELECT COUNT(*) as cnt FROM webauthn_credentials")
        result = await row.fetchone()
    return {"registered": result["cnt"] > 0}
