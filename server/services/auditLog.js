export async function writeAuditLog(supabaseAdmin, entry) {
    // Insert the audit log entry into the 'admin_audit_log' table
    const { error } = await supabaseAdmin
        .from('admin_audit_log')
        .insert([entry]);

    if (error) {
        console.error('Error writing audit log:', error);
        throw new Error('Failed to write audit log');
    }
}