// supabase.js - الاتصال بقاعدة البيانات الجديدة

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// بيانات مشروع Supabase الجديد
const SUPABASE_URL = 'https://kwatmrhfpynazssfseg1.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3A7QQ474Vtt9JTup4IbjsA_KiXn7Oov';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============= دوال المستخدمين =============
export async function getMembers() {
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name');
    if (error) throw error;
    return data;
}

export async function getMemberById(id) {
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function addMember(member) {
    const { data, error } = await supabase
        .from('members')
        .insert([member])
        .select();
    if (error) throw error;
    return data[0];
}

// ============= دوال المعاملات المالية =============
export async function getTransactions(filters = {}) {
    let query = supabase
        .from('transactions')
        .select('*, members(name)')
        .order('date', { ascending: false });
    
    if (filters.member_id) {
        query = query.eq('member_id', filters.member_id);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
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
            status: 'pending',
            approval_status: 'pending'
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function confirmTransaction(id, confirmedBy) {
    const { data, error } = await supabase
        .from('transactions')
        .update({
            status: 'approved',
            approval_status: 'approved',
            confirmed_by: confirmedBy,
            confirmed_at: new Date().toISOString()
        })
        .eq('id', id)
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

// ============= دوال إنتاج الخياطين =============
export async function getProductions(filters = {}) {
    let query = supabase
        .from('productions')
        .select('*, members(name)')
        .order('date', { ascending: false });
    
    if (filters.member_id) {
        query = query.eq('member_id', filters.member_id);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
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
            status: 'pending'
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function confirmProduction(id, confirmedBy) {
    const { data, error } = await supabase
        .from('productions')
        .update({
            status: 'approved',
            confirmed_by: confirmedBy
        })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateProductionPrice(id, price) {
    const { data, error } = await supabase
        .from('productions')
        .update({ price: price })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

// ============= دوال التكرار التلقائي =============
export async function getRecurringSettings(memberId = null) {
    let query = supabase
        .from('recurring_settings')
        .select('*, members(name)')
        .eq('status', 'active');
    
    if (memberId) {
        query = query.eq('member_id', memberId);
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
            status: 'active'
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateRecurringStatus(id, status) {
    const { data, error } = await supabase
        .from('recurring_settings')
        .update({ status: status })
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

// ============= دوال الاعتراضات =============
export async function getObjections(filters = {}) {
    let query = supabase
        .from('objections')
        .select('*, members(name)')
        .order('date', { ascending: false });
    
    if (filters.member_id) {
        query = query.eq('member_id', filters.member_id);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
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
            status: 'pending',
            date: new Date().toISOString()
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function resolveObjection(id, resolvedBy, response) {
    const { data, error } = await supabase
        .from('objections')
        .update({
            status: 'resolved',
            resolved_by: resolvedBy,
            resolved_at: new Date().toISOString(),
            response: response
        })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
}

// ============= دوال سجل الأحداث =============
export async function addAuditLog(log) {
    const { data, error } = await supabase
        .from('audit_log')
        .insert([{
            ...log,
            id: Date.now(),
            created_at: new Date().toISOString()
        }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function getAuditLogs(filters = {}) {
    let query = supabase
        .from('audit_log')
        .select('*, members(name)')
        .order('created_at', { ascending: false });
    
    if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
    }
    if (filters.target_type) {
        query = query.eq('target_type', filters.target_type);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}