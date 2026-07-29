# Smart Rental Management System

## Overview

The Smart Rental Management System is an AI-powered web application designed to simplify rental operations for customers, merchants, and administrators. It provides secure authentication, property management, booking services, AI-driven recommendations, and multilingual support through separate portals for each user role.

---

## Features

### Customer Portal

* User registration and JWT authentication
* Browse and search rental properties
* AI-powered property recommendations
* Book and manage rentals
* View booking history
* Multilingual support (English, Amharic, and Afaan Oromo)

### Merchant Portal

* Secure merchant authentication
* Create, update, and delete rental properties
* Upload multiple property images
* Manage bookings
* AI-based demand prediction

### Admin Portal

* Manage users and merchants
* Monitor rental activities
* Fraud detection and merchant risk analysis
* System analytics dashboard

---

## Technology Stack

| Category       | Technology         |
| -------------- | ------------------ |
| Frontend       | Vue.js, TypeScript |
| Backend        | NestJS             |
| AI Services    | FastAPI, Python    |
| Database       | MongoDB            |
| Authentication | JWT                |
| Image Storage  | Cloudinary         |
| Email Service  | Resend             |
| SMS Service    | Africa's Talking   |
| Deployment     | Render, Vercel     |

---

## System Architecture

```text
Vue.js Frontend
        │
        ▼
NestJS REST API
        │
        ├── MongoDB
        ├── FastAPI AI Services
        ├── Cloudinary
        ├── Email Service
        └── SMS Service
```

---

## Installation

```bash
git clone <repository-url>

cd smart-rental-management-system

npm install

npm run start:dev
```

---

## Environment Variables

Create a `.env` file and configure the required environment variables.

```env
MONGODB_URI=

JWT_SECRET=

CLOUDINARY_CLOUD_NAME=

CLOUDINARY_API_KEY=

CLOUDINARY_API_SECRET=

AI_BASE_URL=

RESEND_API_KEY=
```

---

## Project Structure

```text
src/
├── admin
├── customer
├── merchant
├── property
├── booking
├── ai
├── notifications
├── auth
└── main.ts
```

---

## Future Improvements

* Docker support
* Refresh token authentication
* Payment gateway integration
* Mobile application
* Automated testing

---

## Author

**Leul Gebremichael Welearegay**

* Email: [leulgmichael@gmail.com](mailto:leulgmichael@gmail.com)
* GitHub: https://github.com/leul12345687
* LinkedIn: https://www.linkedin.com/in/leul-gebremichael
