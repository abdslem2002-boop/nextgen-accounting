// supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://dcnldsccemjkhyknmrzq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6ikViMtsw7oGV3rS_3ut5g_cgJcKFTy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== المصادقة ====================
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // جلب دور المستخدم من جدول profiles
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
    if (profileError) throw profileError;
    return { user: data.user, role: profile.role };
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, name')
        .eq('id', user.id)
        .single();
    return { ...user, role: profile?.role, name: profile?.name };
}

// ==================== سجل الأحداث ====================
export async function addAuditLog({ user_id, action, target_type, target_id, old_value = null, new_value = null }) {
    const { error } = await supabase.from('audit_log').insert([{
        user_id, action, target_type, target_id, old_value, new_value,
        created_at: new Date().toISOString()
    }]);
    if (error) console.error('Audit log error:', error);
}

// ==================== الصندوق العام (يحسب ديناميكياً من journal_lines) ====================
export async function getMasterBalance() {
    // حساب الرصيد الحالي من القيود (كل القيود المعتمدة)
    const { data, error } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit')
        .eq('journal_entries.status', 'approved');
    if (error) throw error;
    let balance = 0;
    for (const line of data) {
        if (line.account_id === 'cash') { // حساب الصندوق
            balance += (line.debit || 0) - (line.credit || 0);
        }
    }
    return balance;
}

// ==================== المعاملات (مع قيد مزدوج) ====================
export async function addTransaction(transaction, userId) {
    // transaction: { member_id, amount, description, category, type (expense/income) }
    const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert([{
            id: crypto.randomUUID(),
            date: new Date().toISOString().split('T')[0],
            description: transaction.description,
            status: 'pending',
            created_by: userId
        }])
        .select()
        .single();
    if (entryError) throw entryError;

    // حساب المصروف أو الإيراد
    const isExpense = transaction.type === 'expense';
    const lines = [
        { journal_entry_id: entry.id, account_id: isExpense ? transaction.category : 'cash', debit: isExpense ? transaction.amount : 0, credit: 0 },
        { journal_entry_id: entry.id, account_id: isExpense ? 'cash' : transaction.category, debit: 0, credit: isExpense ? 0 : transaction.amount }
    ];
    const { error: linesError } = await supabase.from('journal_lines').insert(lines);
    if (linesError) throw linesError;

    // إضافة سجل في جدول transactions للربط مع العضو
    const { error: transError } = await supabase.from('transactions').insert([{
        id: crypto.randomUUID(),
        member_id: transaction.member_id,
        journal_entry_id: entry.id,
        amount: transaction.amount,
        description: transaction.description,
        category: transaction.category,
        type: transaction.type,
        date: entry.date,
        status: 'pending',
        created_by: userId
    }]);
    if (transError) throw transError;

    await addAuditLog({ user_id: userId, action: 'add', target_type: 'transaction', target_id: entry.id, new_value: transaction.description });
    return entry;
}

export async function reviewTransaction(transactionId, userId, action, reason = null) {
    // action: 'approve' or 'reject'
    const newStatus = action === 'approve' ? 'auditor_reviewed' : 'rejected';
    const { error } = await supabase
        .from('transactions')
        .update({ status: newStatus, auditor_id: userId, auditor_at: new Date(), reject_reason: reason })
        .eq('id', transactionId);
    if (error) throw error;
    // تحديث journal_entries بنفس الحالة
    const { data: tx } = await supabase.from('transactions').select('journal_entry_id').eq('id', transactionId).single();
    await supabase.from('journal_entries').update({ status: newStatus }).eq('id', tx.journal_entry_id);
    await addAuditLog({ user_id: userId, action: `auditor_${action}`, target_type: 'transaction', target_id: transactionId });
}

export async function approveTransaction(transactionId, userId) {
    // اعتماد نهائي من المدير
    const { data: tx } = await supabase.from('transactions').select('journal_entry_id').eq('id', transactionId).single();
    const { error } = await supabase
        .from('transactions')
        .update({ status: 'approved', admin_id: userId, admin_at: new Date() })
        .eq('id', transactionId);
    if (error) throw error;
    await supabase.from('journal_entries').update({ status: 'approved' }).eq('id', tx.journal_entry_id);
    await addAuditLog({ user_id: userId, action: 'admin_approve', target_type: 'transaction', target_id: transactionId });
}

// ==================== الإنتاج ====================
export async function addProduction(production, userId) {
    // production: { member_id, product_name, model, quantity, price }
    const { error } = await supabase.from('productions').insert([{
        id: crypto.randomUUID(),
        member_id: production.member_id,
        product_name: production.product_name,
        model: production.model,
        quantity: production.quantity,
        price: production.price,
        date: new Date().toISOString().split('T')[0],
        status: 'pending',
        created_by: userId
    }]);
    if (error) throw error;
    await addAuditLog({ user_id: userId, action: 'add', target_type: 'production', new_value: production.product_name });
}

export async function reviewProduction(productionId, userId) {
    const { error } = await supabase
        .from('productions')
        .update({ status: 'auditor_reviewed', auditor_id: userId, auditor_at: new Date() })
        .eq('id', productionId);
    if (error) throw error;
    await addAuditLog({ user_id: userId, action: 'auditor_approve', target_type: 'production', target_id: productionId });
}

export async function approveProduction(productionId, userId) {
    const { error } = await supabase
        .from('productions')
        .update({ status: 'approved', admin_id: userId, admin_at: new Date() })
        .eq('id', productionId);
    if (error) throw error;
    await addAuditLog({ user_id: userId, action: 'admin_approve', target_type: 'production', target_id: productionId });
}

// ==================== الاعتراضات ====================
export async function addObjection(objection, userId) {
    const { error } = await supabase.from('objections').insert([{
        id: crypto.randomUUID(),
        member_id: objection.member_id,
        transaction_id: objection.transaction_id,
        production_id: objection.production_id,
        reason: objection.reason,
        date: new Date().toISOString(),
        status: 'pending'
    }]);
    if (error) throw error;
    await addAuditLog({ user_id: userId, action: 'objection', target_type: objection.transaction_id ? 'transaction' : 'production', target_id: objection.transaction_id || objection.production_id, new_value: objection.reason });
}

export async function resolveObjection(objectionId, userId, response) {
    const { error } = await supabase
        .from('objections')
        .update({ status: 'resolved', resolved_by: userId, resolved_at: new Date(), response })
        .eq('id', objectionId);
    if (error) throw error;
    await addAuditLog({ user_id: userId, action: 'resolve', target_type: 'objection', target_id: objectionId, new_value: response });
}

// ==================== إدارة الأعضاء (للمدير فقط) ====================
export async function getAllProfiles() {
    const { data, error } = await supabase.from('profiles').select('*').order('name');
    if (error) throw error;
    return data;
}

export async function deleteUser(userId) {
    // استدعاء edge function أو استخدام RPC (لحذف مستخدم auth)
    const { error } = await supabase.rpc('delete_user', { user_id: userId });
    if (error) throw error;
}

// ==================== إحصائيات ====================
export async function getStats(role, userId = null) {
    let queryTransactions = supabase.from('transactions').select('status', { count: 'exact' });
    let queryProductions = supabase.from('productions').select('status', { count: 'exact' });
    if (role !== 'admin') {
        queryTransactions = queryTransactions.eq('member_id', userId);
        queryProductions = queryProductions.eq('member_id', userId);
    }
    const { data: transData } = await queryTransactions;
    const { data: prodData } = await queryProductions;
    return {
        pendingTransactions: transData?.filter(t => t.status === 'pending').length || 0,
        auditorReviewedTransactions: transData?.filter(t => t.status === 'auditor_reviewed').length || 0,
        approvedTransactions: transData?.filter(t => t.status === 'approved').length || 0,
        pendingProductions: prodData?.filter(p => p.status === 'pending').length || 0,
        auditorReviewedProductions: prodData?.filter(p => p.status === 'auditor_reviewed').length || 0,
    };
}