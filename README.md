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
