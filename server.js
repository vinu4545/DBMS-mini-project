require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err.message));

const { Schema, model } = mongoose;

const memberSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  age: Number,
  gender: String
}, { timestamps: true });

const trainerSchema = new Schema({
  name: { type: String, required: true },
  specialization: { type: String, required: true },
  phone: String,
  experience: Number
}, { timestamps: true });

const planSchema = new Schema({
  name: { type: String, required: true },
  durationMonths: { type: Number, required: true },
  price: { type: Number, required: true },
  description: String
}, { timestamps: true });

const subscriptionSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  plan: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ["active", "expired"], default: "active" },
  durationMonths: Number
}, { timestamps: true });

const paymentSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  subscription: { type: Schema.Types.ObjectId, ref: "Subscription" },
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  method: { type: String, default: "Cash" },
  status: { type: String, enum: ["paid", "pending", "failed"], default: "paid" }
}, { timestamps: true });

const historySchema = new Schema({
  originalSubscriptionId: String,
  member: { type: Schema.Types.ObjectId, ref: "Member" },
  plan: { type: Schema.Types.ObjectId, ref: "Plan" },
  startDate: Date,
  endDate: Date,
  status: String,
  durationMonths: Number,
  archivedAt: { type: Date, default: Date.now }
});

const Member = model("Member", memberSchema);
const Trainer = model("Trainer", trainerSchema);
const Plan = model("Plan", planSchema);
const Subscription = model("Subscription", subscriptionSchema);
const Payment = model("Payment", paymentSchema);
const SubscriptionHistory = model("SubscriptionHistory", historySchema);

// Basic CRUD routes for each collection.
const resources = { members: Member, trainers: Trainer, plans: Plan, subscriptions: Subscription, payments: Payment };

for (const [route, Model] of Object.entries(resources)) {
  app.get(`/api/${route}`, async (req, res) => {
    try {
      let query = {};
      if (route === "members" && req.query.plan) {
        const subs = await Subscription.find({ plan: req.query.plan }).select("member");
        query._id = { $in: subs.map(s => s.member) };
      }
      if (route === "trainers" && req.query.specialization) {
        query.specialization = new RegExp(req.query.specialization, "i");
      }
      const docs = await Model.find(query).sort({ createdAt: -1 })
        .populate(route === "subscriptions" ? ["member", "plan"] :
                  route === "payments" ? ["member", "subscription"] : []);
      res.json(docs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });y

  app.post(`/api/${route}`, async (req, res) => {
    try { res.status(201).json(await Model.create(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put(`/api/${route}/:id`, async (req, res) => {
    try {
      const updated = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!updated) return res.status(404).json({ error: "Record not found" });
      res.json(updated);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete(`/api/${route}/:id`, async (req, res) => {
    try {
      const deleted = await Model.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Record not found" });
      res.json({ message: "Record deleted" });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}

// Archive expired subscriptions before removing them from the active collection.
app.post("/api/maintenance/archive-expired", async (req, res) => {
  try {
    const expired = await Subscription.find({ endDate: { $lt: new Date() } });
    if (!expired.length) return res.json({ archived: 0, message: "No expired subscriptions found" });
    await SubscriptionHistory.insertMany(expired.map(s => ({
      originalSubscriptionId: s._id.toString(), member: s.member, plan: s.plan,
      startDate: s.startDate, endDate: s.endDate, status: "expired",
      durationMonths: s.durationMonths
    })));
    await Subscription.deleteMany({ _id: { $in: expired.map(s => s._id) } });
    res.json({ archived: expired.length, message: "Expired subscriptions moved to history" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/history", async (req, res) => {
  try {
    res.json(await SubscriptionHistory.find().populate("member plan").sort({ archivedAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aggregation pipelines.
app.get("/api/analytics/members-per-plan", async (req, res) => {
  const data = await Subscription.aggregate([
    { $group: { _id: "$plan", members: { $addToSet: "$member" } } },
    { $project: { plan: "$_id", memberCount: { $size: "$members" }, _id: 0 } },
    { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "planInfo" } },
    { $unwind: "$planInfo" }, { $project: { plan: "$planInfo.name", memberCount: 1 } }
  ]);
  res.json(data);
});

app.get("/api/analytics/monthly-revenue", async (req, res) => {
  const data = await Payment.aggregate([
    { $match: { status: "paid" } },
    { $group: { _id: { year: { $year: "$paymentDate" }, month: { $month: "$paymentDate" } }, revenue: { $sum: "$amount" }, payments: { $sum: 1 } } },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);
  res.json(data);
});

app.get("/api/analytics/popular-plan", async (req, res) => {
  const data = await Subscription.aggregate([
    { $group: { _id: "$plan", subscriptions: { $sum: 1 } } },
    { $sort: { subscriptions: -1 } }, { $limit: 1 },
    { $lookup: { from: "plans", localField: "_id", foreignField: "_id", as: "planInfo" } },
    { $unwind: "$planInfo" },
    { $project: { _id: 0, plan: "$planInfo.name", subscriptions: 1 } }
  ]);
  res.json(data[0] || { message: "No subscription data yet" });
});

app.get("/api/analytics/average-duration", async (req, res) => {
  const data = await Subscription.aggregate([
    { $group: { _id: null, averageMonths: { $avg: "$durationMonths" } } },
    { $project: { _id: 0, averageMonths: { $round: ["$averageMonths", 2] } } }
  ]);
  res.json(data[0] || { averageMonths: 0 });
});

app.get("/api/analytics/expired", async (req, res) => {
  const [activeExpired, archived] = await Promise.all([
    Subscription.countDocuments({ endDate: { $lt: new Date() } }),
    SubscriptionHistory.countDocuments()
  ]);
  res.json({ expiredInSubscriptions: activeExpired, archivedHistory: archived });
});

app.get("/api/analytics/summary", async (req, res) => {
  const [members, trainers, plans, subscriptions, revenue] = await Promise.all([
    Member.countDocuments(), Trainer.countDocuments(), Plan.countDocuments(),
    Subscription.countDocuments({ endDate: { $gte: new Date() } }),
    Payment.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }])
  ]);
  res.json({ members, trainers, plans, activeSubscriptions: subscriptions, totalRevenue: revenue[0]?.total || 0 });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
