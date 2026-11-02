import { Router } from "express";
import { getSupabaseAdmin, supabase } from "../services/supabase.js";

const patientRouter = Router();

function accessToken(request) {
    return (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

function formatProfile(profile) {
    return {
        id: profile.id,
        name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
        subrole: null,
        utepId: profile.utep_id || null,
    };
}

async function requirePatient(request, response) {
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

    return { supabaseAdmin: supabaseAdmin, user: authData.user };

}

patientRouter.get("/dashboard", async (request, response) => {
    try {
        const context = await requirePatient(request, response);
        if (!context) return;

        const { supabaseAdmin, user } = context
        const patientId = user.id;
        

        const [history, medications, appointments, careTeam, updates, allergies, referrals, vitals] = await Promise.all([
            supabaseAdmin.schema('patient_portal').from('medical_history').select('*').eq('profile_id', patientId),
            supabaseAdmin.schema('patient_portal').from('medications').select('*').eq('patient_id', patientId),
            supabaseAdmin.schema('patient_portal').from('appointments').select('*').eq('patient_id', patientId),
            supabaseAdmin.schema('patient_portal').from('care_team').select('*').eq('patient_id', patientId),
            supabaseAdmin.schema('patient_portal').from('clinical_updates').select('*').eq('patient_id', patientId),
            supabaseAdmin.schema('patient_portal').from('allergies').select('*').eq('profile_id', patientId),
            supabaseAdmin.schema('patient_portal').from('referrals').select('*').eq('patient_id', patientId),
            supabaseAdmin.schema('patient_portal').from('vitals').select('*').eq('patient_id', patientId)
        ]);



        return response.json({
            metrics: {
                activeMedications: (medications.data || []).filter(m => m.status === 'Active').length,
                upcomingAppointments: (appointments.data || []).filter(a => a.status === 'Scheduled').length,
                unreadUpdates: (updates.data || []).filter(u => !u.is_read).length
            },
            medicalHistory: history.data || [],
            medications: medications.data || [],
            appointments: appointments.data || [],
            careTeam: careTeam.data || [],
            clinicalUpdates: updates.data || [],
            allergies: allergies.data || [], 
            referrals: referrals.data || [],
            vitals: vitals || []
        });
    } catch (error) {
        console.error("Unable to load patient overview:", error);
        return response.status(500).json({ message: "Unable to load patient dashboard." });
    }

});

patientRouter.get("/care-team", async (request, response) => {
  try {
    const authContext = await requirePatient(request, response);
    if (!authContext) return;

    const { supabaseAdmin, user } = authContext;
    const patientId = user.id;

    //  care team entries for the patient
    const { data: careTeamRows, error: careTeamError } = await supabaseAdmin
      .schema('patient_portal')
      .from("care_team")
      .select("id, patient_id, provider_id, subrole_id, is_primary, created_at")
      .eq("patient_id", patientId);

    if (careTeamError) {
      console.error("Unable to load care team:", careTeamError.message);
      return response.status(500).json({ message: "Unable to load care team." });
    }

    if (!careTeamRows || careTeamRows.length === 0) {
      return response.json([]);
    }


    const enrichedCareTeam = await Promise.all(
      careTeamRows.map(async (member) => {
        let providerData = null;
        let subroleData = null;

        if (member.provider_id) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name, careflow_id")
            .eq("id", member.provider_id)
            .single();
          providerData = profile;
        }

        if (member.subrole_id) {
          const { data: subrole } = await supabaseAdmin
            .from("subroles")
            .select("id, name")
            .eq("id", member.subrole_id)
            .single();
          subroleData = subrole;
        }

        return {
          ...member,
          provider: providerData,
          subrole: subroleData
        };
      })
    );

    return response.json(enrichedCareTeam);
  } catch (error) {
    console.error("Unable to load care team route:", error);
    return response.status(500).json({ message: "Unable to load care team." });
  }
});


patientRouter.get("/appointments", async (request, response) => {
    try {
        const context = await requirePatient(request, response);
        if (!context) return;
        const { supabaseAdmin, user } = context;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('appointments')
            .select('*')
            .eq('patient_id', user.id)
            .order('appointment_date', { ascending: true });

        if (error) throw error;
        return response.json(data || []);
    } catch (error) {
        console.error("Error fetching appointments:", error);
        return response.status(500).json({ message: "Unable to load appointments." });
    }
});

// Schedule a new appointment
patientRouter.post("/appointments", async (request, response) => {
    try {
        const context = await requirePatient(request, response);
        if (!context) return;
        const { supabaseAdmin, user } = context;
        const { reason, appointment_date, location } = request.body;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('appointments')
            .insert({
                patient_id: user.id,
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


patientRouter.patch("/referrals/:id/schedule", async (request, response) => {
  try {
    const context = await requirePatient(request, response);
    if (!context) return;

    const { supabaseAdmin, user } = context;
    const { id } = request.params;
    const { appointmentId } = request.body || {};

    if (!appointmentId) {
      return response.status(400).json({
        message: "An appointment is required.",
      });
    }

    // Verify the appointment belongs to the logged-in patient.
    const { data: appointment, error: appointmentError } =
      await supabaseAdmin
        .schema("patient_portal")
        .from("appointments")
        .select("id")
        .eq("id", appointmentId)
        .eq("patient_id", user.id)
        .maybeSingle();

    if (appointmentError) throw appointmentError;

    if (!appointment) {
      return response.status(404).json({
        message: "Appointment not found.",
      });
    }

    // Update only a referral owned by this patient.
    const { data, error } = await supabaseAdmin
      .schema("patient_portal")
      .from("referrals")
      .update({
        status: "Approved",
        linked_appointment_id: appointmentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("patient_id", user.id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return response.status(404).json({
        message: "Referral not found.",
      });
    }

    return response.json(data);
  } catch (error) {
    console.error("Unable to update referral:", error);
    return response.status(500).json({
      message: "Unable to update referral.",
    });
  }
});


patientRouter.get("/vitals", async (request, response) => {
    try {
        const context = await requirePatient(request, response);
        if (!context) return;
        const { supabaseAdmin, user } = context;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('vitals')
            .select('*')
            .eq('patient_id', user.id)
            .order('recorded_date', { ascending: false });

        if (error) throw error;
        return response.json(data || []);
    } catch (error) {
        console.error("Error fetching vitals:", error);
        return response.status(500).json({ message: "Unable to load vitals." });
    }
});
// Fetch patient demographic record from the public schema
patientRouter.get("/record", async (request, response) => {
    try {
        const context = await requirePatient(request, response);
        if (!context) return;
        const { supabaseAdmin, user } = context;

        const { data, error } = await supabaseAdmin
            .from('patient_records')
            .select('*')
            .eq('profile_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return response.json(data || null);
    } catch (error) {
        console.error("Error fetching patient record:", error);
        return response.status(500).json({ message: "Unable to load patient record." });
    }
});

// Fetch patient vitals from the patient_portal schema
patientRouter.get("/vitals", async (request, response) => {
    try {
        const context = await requirePatient(request, response);
        if (!context) return;
        const { supabaseAdmin, user } = context;

        const { data, error } = await supabaseAdmin
            .schema('patient_portal')
            .from('vitals')
            .select('*')
            .eq('patient_id', user.id)
            .order('recorded_date', { ascending: false });

        if (error) throw error;
        return response.json(data || []);
    } catch (error) {
        console.error("Error fetching vitals:", error);
        return response.status(500).json({ message: "Unable to load vitals." });
    }
});

export default patientRouter;
