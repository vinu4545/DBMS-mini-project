# FitCore — Gym Management System

A small full-stack college project focused on MongoDB CRUD operations and aggregation.

## Stack
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database: MongoDB + Mongoose

## 1. Requirements
Install Node.js (LTS) and MongoDB Community Server, or create a MongoDB Atlas database.

## 2. Setup
```bash
cd gym-management-system
npm install
cp .env.example .env
```
Edit `.env` and set your MongoDB connection string. For local MongoDB:
```env
MONGODB_URI=mongodb://127.0.0.1:27017/gym_management
PORT=5000
```
For MongoDB Atlas, replace the URI with your Atlas connection string.

## 3. Run
```bash
npm run dev
```
Open http://localhost:5000

## Collections
- `members`
- `trainers`
- `plans`
- `subscriptions`
- `payments`
- `subscriptionhistories` (archive collection; Mongoose pluralizes the model name)

## CRUD
The frontend provides Add, View, Edit and Delete for the five main collections. For subscriptions and payments, choose related member/plan/subscription records from dropdowns.

## Required searches
- Members by plan: `GET /api/members?plan=<PLAN_OBJECT_ID>`
- Trainers by specialization: `GET /api/trainers?specialization=Yoga`

## Aggregation endpoints
- `GET /api/analytics/members-per-plan`
- `GET /api/analytics/monthly-revenue`
- `GET /api/analytics/popular-plan`
- `GET /api/analytics/average-duration`
- `GET /api/analytics/expired`
- `GET /api/analytics/summary`

## Expired subscription history
Click **Archive expired subscriptions** on the Aggregations page. The backend copies expired subscription documents into `subscriptionhistories` and only then deletes them from `subscriptions`. This preserves a history record.

## Suggested demo sequence
1. Add 2–3 members, 2 trainers and 2 plans.
2. Create subscriptions linking a member to a plan.
3. Add payments and mark them `paid`.
4. Open Aggregations and demonstrate each report.
5. To test archiving, create a subscription with an end date in the past, then click Archive expired subscriptions.

## Important notes
- This is a deliberately small academic demo, not production software.
- Deleting a member/plan that is referenced by subscriptions can leave dangling references. For a production system, add referential checks and transactions.
- The members-by-plan filter expects a MongoDB ObjectId. Copy the plan `_id` from the API response or MongoDB Compass.
- The `status` field is not automatically recalculated when dates pass; the expired aggregation uses `endDate` and archive action.
