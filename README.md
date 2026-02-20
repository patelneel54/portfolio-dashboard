To deploy on your UGREEN NAS:

SSH into your NAS and clone:


git clone https://github.com/patelneel54/portfolio-dashboard.git
cd portfolio-dashboard
Create your .env file:


cp .env.example .env
# Edit .env with your PIN hash and JWT secret
Run with Docker:


docker compose up -d
Access at http://<NAS-IP>:8000

To add to iPhone home screen:

Open http://<NAS-IP>:8000 in Safari
Tap the Share button → "Add to Home Screen"
It'll run as a standalone app with the portfolio icon
First — one-time setup on your Windows machine

#Open Windows Terminal and generate your PIN hash (replace 1234 with whatever PIN you want):


docker run --rm python:3.12-slim sh -c "pip install bcrypt -q 2>/dev/null && python -c \"import bcrypt; print(bcrypt.hashpw(b'1234', bcrypt.gensalt()).decode())\""
Copy the output — it looks like $2b$12$abc123...

Then commit and push the docker-compose fix:


cd c:/Users/patel/Documents/code/Finance
git add docker-compose.yml
git commit -m "Fix docker-compose to use Portainer-compatible env vars"
git push
Then in Portainer on your NAS:

http://NAS_IP:9000 → Stacks → + Add Stack
Name it portfolio
Build method: Repository
URL: https://github.com/patelneel54/portfolio-dashboard, ref: refs/heads/master
Compose path: docker-compose.yml
Scroll to Environment variables, add:
Name	Value
AUTH_PIN_HASH	(your hash from above)
JWT_SECRET	(any random string)
REFRESH_HOUR	16
REFRESH_MINUTE	30
Click Deploy the stack — wait 3–5 min for first build
Open http://NAS_IP:8000
Future updates: Portainer → Stacks → portfolio → Pull and redeploy



Step 1 — Deploy the Stack Without a PIN
In Portainer, when you add your environment variables, leave AUTH_PIN_HASH blank (still add the key, just empty value). The app is coded to skip authentication entirely if no hash is set — so it'll open without a login for now.

Step 2 — Generate the Hash Inside Portainer
Once the container is running:

In Portainer, click Containers → portfolio-dashboard
Click Exec Console (or "Console" button)
Select /bin/sh and click Connect
You now have a terminal inside the container. Run:

python backend/auth.py 1234
(replace 1234 with your PIN)

It prints your hash — copy it
Step 3 — Add the Hash to Your Stack
Go back to Stacks → portfolio
Click Editor
Find the AUTH_PIN_HASH environment variable and paste in your hash
Click Update the stack
The container restarts with your PIN active — done, all from Portainer.
