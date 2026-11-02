import { Router } from "express";
import { getSupabaseAdmin, supabase } from "../services/supabase.js";

const billingRouter = Router();

function accessToken(request) {
    return (request.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

async function requireBillingUser(request, response) {
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

// Load billing dashboard (claims queue, insurance providers, patient records)
billingRouter.get("/dashboard", async (request, response) => {
    try {
        const context = await requireBillingUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;

        const [claimsRes, providersRes, recordsRes] = await Promise.all([
            supabaseAdmin.schema('billing').from('claims').select('*').order('created_at', { ascending: false }),
            supabaseAdmin.from('insurance_providers').select('*'),
            supabaseAdmin.from('patient_records').select('*')
        ]);
        console.log("claims: ", claimsRes)

        return response.json({
            claims: claimsRes.data || [],
            insuranceProviders: providersRes.data || [],
            patientRecords: recordsRes.data || []
        });
    } catch (error) {
        console.error("Error loading billing dashboard:", error);
        return response.status(500).json({ message: "Unable to load billing dashboard." });
    }
});

// PATCH /api/billing/claims/:id/status - Update claim status (e.g., 'New', 'Pending', 'Paid', 'Denied', 'Cancelled')
billingRouter.patch("/claims/:id/status", async (request, response) => {
    try {
        const context = await requireBillingUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const { id } = request.params;
        const { status } = request.body;

        const { data, error } = await supabaseAdmin
            .schema('billing')
            .from('claims')
            .update({ 
                status: status || 'Pending', 
                updated_at: new Date().toISOString() 
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return response.json(data);
    } catch (error) {
        console.error("Error updating claim status:", error);
        return response.status(500).json({ message: "Unable to update claim status." });
    }
});

// PATCH /api/billing/claims/:id/codes - Update CPT procedure and ICD-10 diagnosis selections
billingRouter.patch("/claims/:id/codes", async (request, response) => {
    try {
        const context = await requireBillingUser(request, response);
        if (!context) return;

        const { supabaseAdmin } = context;
        const { id } = request.params;
        const { cpt_code, icd10_code } = request.body;

        const { data, error } = await supabaseAdmin
            .schema('billing')
            .from('claims')
            .update({ 
                cpt_code, 
                icd10_code, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return response.json(data);
    } catch (error) {
        console.error("Error updating claim codes:", error);
        return response.status(500).json({ message: "Unable to update claim coding selections." });
    }
});

export default billingRouter;