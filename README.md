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

Open Windows Terminal and generate your PIN hash (replace 1234 with whatever PIN you want):


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
