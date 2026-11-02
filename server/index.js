import express from "express";
import adminRouter from "./routes/admin.js";
import authRouter from "./routes/auth.js";
import rolesRouter from "./routes/roles.js";
import casesRouter from "./routes/cases.js";
import studentRouter from "./routes/student.js";
import instructorRouter from "./routes/instructor.js";
import patientRouter  from "./routes/patient.js";
import frontdeskRouter from "./routes/frontdesk.js";
import billingRouter from "./routes/billing.js";
import { requireRole } from "./middleware/requireRole.js";

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use("/api/admin", adminRouter);
app.use("/api/auth", authRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/cases", casesRouter);
app.use("/api/student", studentRouter);
app.use("/api/instructor", instructorRouter);
app.use("/api", authRouter);
app.use("/api/patient", requireRole("Patient"), patientRouter);
app.use("/api/front-desk", requireRole("Student", 10), frontdeskRouter);
app.use("/api/billing", requireRole("Student", 11), billingRouter);

app.listen(port, () => {
  console.log(`EMR API listening at http://localhost:${port}`);
});
