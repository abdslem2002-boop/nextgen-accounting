import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://dcnldsccemjkhyknmrzq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6ikViMtsw7oGV3rS_3ut5g_cgJcKFTy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// تسجيل الدخول
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
    localStorage.setItem('role', profile.role);
    localStorage.setItem('userId', profile.id);
    localStorage.setItem('userName', profile.name);
    return profile;
}

// تسجيل الخروج
export async function signOut() {
    await supabase.auth.signOut();
    localStorage.clear();
}

// الحصول على المستخدم الحالي
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    return profile;
}

// جلب المعاملات (حسب الصلاحية)
export async function getTransactions() {
    const user = await getCurrentUser();
    let query = supabase.from('transactions').select('*, members:member_id(name)').order('date', { ascending: false });
    if (user.role !== 'admin') query = query.eq('member_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// إضافة معاملة (مع قيد مزدوج مبسط)
export async function addTransaction(transaction) {
    const user = await getCurrentUser();
    const { data, error } = await supabase.from('transactions').insert([{
        member_id: transaction.member_id,
        amount: transaction.amount,
        description: transaction.description,
        category: transaction.category,
        date: new Date().toISOString().split('T')[0],
        status: 'pending',
        created_by: user.id
    }]).select();
    if (error) throw error;
    return data[0];
}

// جلب الإنتاج
export async function getProductions() {
    const user = await getCurrentUser();
    let query = supabase.from('productions').select('*, members:member_id(name)').order('date', { ascending: false });
    if (user.role !== 'admin') query = query.eq('member_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// إضافة إنتاج (للخياطين)
export async function addProduction(production) {
    const user = await getCurrentUser();
    const { data, error } = await supabase.from('productions').insert([{
        member_id: production.member_id || user.id,
        product_name: production.product_name,
        model: production.model,
        quantity: production.quantity,
        price: production.price,
        date: new Date().toISOString().split('T')[0],
        status: 'pending',
        created_by: user.id
    }]).select();
    if (error) throw error;
    return data[0];
}

// جلب جميع الأعضاء (للمدير)
export async function getAllMembers() {
    const { data, error } = await supabase.from('profiles').select('id, name, role').order('name');
    if (error) throw error;
    return data;
}

// تأكيد معاملة (للمراجع)
export async function reviewTransaction(id, approve, reason = null) {
    const status = approve ? 'auditor_reviewed' : 'rejected';
    const update = { status };
    if (!approve && reason) update.reject_reason = reason;
    const { error } = await supabase.from('transactions').update(update).eq('id', id);
    if (error) throw error;
}

// اعتماد نهائي (للمدير)
export async function approveTransaction(id) {
    const { error } = await supabase.from('transactions').update({ status: 'approved' }).eq('id', id);
    if (error) throw error;
}

// تأكيد إنتاج (للمراجع)
export async function reviewProduction(id, approve) {
    const status = approve ? 'auditor_reviewed' : 'rejected';
    const { error } = await supabase.from('productions').update({ status }).eq('id', id);
    if (error) throw error;
}

// اعتماد إنتاج نهائي (للمدير)
export async function approveProduction(id) {
    const { error } = await supabase.from('productions').update({ status: 'approved' }).eq('id', id);
    if (error) throw error;
}