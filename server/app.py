"""SkyBook - Сервіс бронювання авіаквитків."""
from flask import Flask

app = Flask(__name__)

@app.route('/')
def index():
    return {"message": "SkyBook API v1.0.0"}

if __name__ == '__main__':
    app.run(debug=True, port=3000)