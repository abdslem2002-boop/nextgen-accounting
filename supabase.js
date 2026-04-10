// supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// بيانات الاتصال الخاصة بك
const SUPABASE_URL = 'https://dcnldsccemjkhyknmrzq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6ikViMtsw7oGV3rS_3ut5g_cgJcKFTy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== الأعضاء ====================
export async function getMemberById(id) {
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function getAllMembers() {
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name');
    if (error) throw error;
    return data;
}

export async function addMember(member) {
    const { data, error } = await supabase
        .from('members')
        .insert([{ ...member, join_date: new Date().toISOString() }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function deleteMember(id) {
    const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return true;
}

// ==================== المعاملات ====================
export async function getTransactions(filters = {}) {
    let query = supabase
        .from('transactions')
        .select('*, members(name)')
        .order('date', { ascending: false });
    
    if (filters.member_id) {
        query = query.eq('member_id', filters.member_id);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function addTransaction(transaction) {
    const { data, error } = await supabase
        .from('transactions')
        .insert([{
            ...transaction,
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            status: 'pending'
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateTransaction(id, updates) {
    const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

// ==================== الإنتاج ====================
export async function getProductions(filters = {}) {
    let query = supabase
        .from('productions')
        .select('*, members(name)')
        .order('date', { ascending: false });
    
    if (filters.member_id) {
        query = query.eq('member_id', filters.member_id);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function addProduction(production) {
    const { data, error } = await supabase
        .from('productions')
        .insert([{
            ...production,
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            status: 'pending'
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateProduction(id, updates) {
    const { data, error } = await supabase
        .from('productions')
        .update(updates)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

// ==================== الاعتراضات ====================
export async function getObjections(filters = {}) {
    let query = supabase
        .from('objections')
        .select('*, members(name)')
        .order('date', { ascending: false });
    
    if (filters.member_id) {
        query = query.eq('member_id', filters.member_id);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function addObjection(objection) {
    const { data, error } = await supabase
        .from('objections')
        .insert([{
            ...objection,
            id: Date.now(),
            date: new Date().toISOString(),
            status: 'pending'
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function resolveObjection(id, resolution) {
    const { data, error } = await supabase
        .from('objections')
        .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            ...resolution
        })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

// ==================== التكرار التلقائي ====================
export async function getRecurringSettings(filters = {}) {
    let query = supabase
        .from('recurring_settings')
        .select('*, members(name)');
    
    if (filters.member_id) {
        query = query.eq('member_id', filters.member_id);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function addRecurringSetting(setting) {
    const { data, error } = await supabase
        .from('recurring_settings')
        .insert([{
            ...setting,
            id: Date.now(),
            created_at: new Date().toISOString()
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateRecurringSetting(id, updates) {
    const { data, error } = await supabase
        .from('recurring_settings')
        .update(updates)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

export async function deleteRecurringSetting(id) {
    const { error } = await supabase
        .from('recurring_settings')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return true;
}

// ==================== الأنظمة (Multi-Tenant) ====================
export async function getSystems() {
    const { data, error } = await supabase
        .from('systems')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function addSystem(system) {
    const { data, error } = await supabase
        .from('systems')
        .insert([{
            ...system,
            created_at: new Date().toISOString()
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function toggleSystem(id, isActive) {
    const { data, error } = await supabase
        .from('systems')
        .update({ is_active: isActive })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

// ==================== سجل الأحداث ====================
export async function addAuditLog(log) {
    try {
        const { error } = await supabase
            .from('audit_log')
            .insert([{
                ...log,
                created_at: new Date().toISOString()
            }]);
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('فشل تسجيل الحدث:', e);
        return false;
    }
}

export async function getAuditLogs(limit = 200) {
    const { data, error } = await supabase
        .from('audit_log')
        .select('*, members(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data;
}