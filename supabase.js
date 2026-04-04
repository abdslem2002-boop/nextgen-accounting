import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://dcnldsccemjkhyknmrzq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6ikViMtsw7oGV3rS_3ut5g_cgJcKFTy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getMemberById(id) {
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function getTransactions(filters = {}) {
    let query = supabase
        .from('transactions')
        .select('*')
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
            status: 'pending'
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function addAuditLog(log) {
    console.log('Audit log:', log);
    return true;
}