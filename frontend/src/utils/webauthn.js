function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function isWebAuthnSupported() {
  return window.PublicKeyCredential !== undefined;
}

export async function startRegistration(optionsJSON) {
  const publicKey = {
    ...optionsJSON,
    challenge: base64urlToBuffer(optionsJSON.challenge),
    user: {
      ...optionsJSON.user,
      id: base64urlToBuffer(optionsJSON.user.id),
    },
  };
  if (optionsJSON.excludeCredentials) {
    publicKey.excludeCredentials = optionsJSON.excludeCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }

  const credential = await navigator.credentials.create({ publicKey });

  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
    },
  };
}

export async function startAuthentication(optionsJSON) {
  const publicKey = {
    ...optionsJSON,
    challenge: base64urlToBuffer(optionsJSON.challenge),
  };
  if (optionsJSON.allowCredentials) {
    publicKey.allowCredentials = optionsJSON.allowCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }

  const credential = await navigator.credentials.get({ publicKey });

  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(credential.response.authenticatorData),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      signature: bufferToBase64url(credential.response.signature),
      userHandle: credential.response.userHandle
        ? bufferToBase64url(credential.response.userHandle)
        : null,
    },
  };
}
