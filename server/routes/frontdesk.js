import { Router } from "express";
import { getSupabaseAdmin, supabase } from "../services/supabase.js";

const frontdeskRouter = Router();

function accessToken(request) {
    return (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

async function requireFrontDeskUser(request, response) {
    const token = accessToken(request);
    if (!token) {
        response.status(401).json({ message: "Missing access token." });
        return null;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
        response.status(401).json({ message: "Your session has expired." });
        return null;
    }

    const supabaseAdmin = getSupabaseAdmin();
    return { supabaseAdmin, user: authData.user };
}

// GET /api/front-desk/dashboard - Load front desk data (profiles, records, appointments, insurance providers)
frontdeskRouter.get("/dashboard", async (request, response) => {
    try {
        const context = await requireFrontDeskUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const nowIso = new Date().toISOString();

        const [profilesRes, recordsRes, providersRes ,appointmentsRes] = await Promise.all([
            supabaseAdmin.from('profiles').select('id, first_name, last_name, utep_id, role_id').eq('role_id', 4),
            supabaseAdmin.from('patient_records').select('*'),
            supabaseAdmin.from('insurance_providers').select('*'),
            supabaseAdmin.schema('patient_portal').from('appointments').select('*').neq('status', 'Completed').order('appointment_date', { ascending: true }),
            
        ]);
       
        return response.json({
            profiles: profilesRes.data || [],
            patientRecords: recordsRes.data || [],
            insuranceProviders: providersRes.data || [],
            appointments: appointmentsRes.data || []
           
        });
    } catch (error) {
        console.error("Error loading front desk dashboard:", error);
        return response.status(500).json({ message: "Unable to load front desk dashboard." });
    }
});

// PATCH /api/front-desk/appointments/:id/status - Toggle check-in status
frontdeskRouter.patch("/appointments/:id/status", async (request, response) => {
    try {
        const context = await requireFrontDeskUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const { id } = request.params;
        const { status } = request.body;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('appointments')
            .update({ status: status || 'Checked-In' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return response.json(data);
    } catch (error) {
        console.error("Error updating appointment status:", error);
        return response.status(500).json({ message: "Unable to update appointment status." });
    }
});

// POST /api/front-desk/appointments - Schedule standalone appointment
frontdeskRouter.post("/appointments", async (request, response) => {
    try {
        const context = await requireFrontDeskUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const { patient_id, reason, appointment_date, location } = request.body;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('appointments')
            .insert({
                patient_id: patient_id,
                reason: reason || "General Consultation",
                appointment_date: appointment_date,
                location: location || "Main Clinic Room A",
                status: "Scheduled"
            })
            .select()
            .single();

        if (error) throw error;
        return response.status(201).json(data);
    } catch (error) {
        console.error("Error scheduling appointment:", error);
        return response.status(500).json({ message: "Unable to schedule appointment." });
    }
});

// POST /api/front-desk/intakes/confirm - Confirm intake, update patient records using foreign key, and check in
frontdeskRouter.post("/intakes/confirm", async (request, response) => {
    try {
        const context = await requireFrontDeskUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const { patient_id, phone, address, insurance_provider_id, insurance_policy_number, appointment_id } = request.body;

        // 1. Check if patient record already exists for this profile
        const { data: existingRecord } = await supabaseAdmin
            .from('patient_records')
            .select('id')
            .eq('profile_id', patient_id)
            .maybeSingle();

        let recordError = null;
        if (existingRecord) {
            const { error } = await supabaseAdmin
                .from('patient_records')
                .update({
                    phone,
                    address,
                    insurance_provider_id: insurance_provider_id ? parseInt(insurance_provider_id, 10) : null,
                    insurance_policy_number,
                    updated_at: new Date().toISOString()
                })
                .eq('profile_id', patient_id);
            recordError = error;
        } else {
            const { error } = await supabaseAdmin
                .from('patient_records')
                .insert({
                    profile_id: patient_id,
                    phone,
                    address,
                    insurance_provider_id: insurance_provider_id ? parseInt(insurance_provider_id, 10) : null,
                    insurance_policy_number,
                    updated_at: new Date().toISOString()
                });
            recordError = error;
        }

        if (recordError) throw recordError;

        // 2. Transition appointment to Checked-In if appointment_id provided, or create walk-in appointment
        let updatedAppt = null;
        if (appointment_id) {
            const { data: apptData, error: apptError } = await supabaseAdmin
                .schema('patient_portal')
                .from('appointments')
                .update({ status: 'Checked-In' })
                .eq('id', appointment_id)
                .select()
                .single();

            if (apptError) throw apptError;
            updatedAppt = apptData;
        } else {
            const { data: walkinData, error: walkinError } = await supabaseAdmin
                .schema('patient_portal')
                .from('appointments')
                .insert({
                    patient_id: patient_id,
                    reason: "Walk-In Consultation",
                    appointment_date: new Date().toISOString(),
                    location: "Main Clinic Room A",
                    status: "Checked-In"
                })
                .select()
                .single();

            if (walkinError) throw walkinError;
            updatedAppt = walkinData;
        }

        return response.json({ message: "Intake confirmed and patient checked-in successfully.", appointment: updatedAppt });
    } catch (error) {
        console.error("Error confirming intake:", error);
        return response.status(500).json({ message: "Unable to process intake verification." });
    }
});
// GET /api/front-desk/patients/:patient_id/referrals - Get pending referrals for a patient
frontdeskRouter.get("/patients/:patient_id/referrals", async (request, response) => {
    try {
        const context = await requireFrontDeskUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const { patient_id } = request.params;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('referrals')
            .select('*')
            .eq('patient_id', patient_id)
            .eq('status', 'Pending'); // or filter depending on your schema status values
        
        if (error) throw error;
        return response.json(data || []);
    } catch (error) {
        console.error("Error loading patient referrals:", error);
        return response.status(500).json({ message: "Unable to load patient referrals." });
    }
});

// PATCH /api/front-desk/referrals/:id/schedule - Link referral to an appointment & update status
frontdeskRouter.patch("/referrals/:id/schedule", async (request, response) => {
    try {
        const context = await requireFrontDeskUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const { id } = request.params;
        const { appointment_id } = request.body;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('referrals')
            .update({ 
                linked_appointment_id: appointment_id,
                status: 'Scheduled', 
                udapted_at: new Date().toISOString
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return response.json(data);
    } catch (error) {
        console.error("Error updating referral status:", error);
        return response.status(500).json({ message: "Unable to update referral status." });
    }
});

export default frontdeskRouter;