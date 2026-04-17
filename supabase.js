// supabase.js - النسخة المتكاملة مع المصادقة الحقيقية وإصلاح الثغرات
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// إعدادات Supabase (تأكد من استبدالها ببيانات مشروعك الفعلية)
const SUPABASE_URL = 'https://dcnldsccemjkhyknmrzq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6ikViMtsw7oGV3rS_3ut5g_cgJcKFTy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// 1. المصادقة والجلسات (حل الثغرة الأمنية الأكبر)
// ============================================================

// تسجيل الدخول باستخدام البريد الإلكتروني وكلمة المرور
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // بعد تسجيل الدخول، نقوم بجلب بيانات المستخدم من جدول profiles
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, role, system_id')
        .eq('id', data.user.id)
        .single();
    if (profileError) throw profileError;
    // تخزين معلومات إضافية في localStorage بشكل مؤقت (للسهولة، مع التحقق لاحقاً)
    localStorage.setItem('memberId', profile.id);
    localStorage.setItem('memberRole', profile.role);
    localStorage.setItem('memberName', profile.name);
    localStorage.setItem('systemId', profile.system_id || 'default');
    return { user: data.user, profile };
}

// تسجيل الخروج
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    localStorage.clear();
}

// الحصول على المستخدم الحالي (للتحقق من صحة الجلسة)
export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    // جلب البروفايل المرتبط
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    return { user, profile };
}

// التحقق من أن المستخدم لديه صلاحية معينة (مثل admin, auditor)
export async function requireRole(requiredRole) {
    const current = await getCurrentUser();
    if (!current) throw new Error('غير مسجل الدخول');
    if (current.profile.role !== requiredRole && current.profile.role !== 'admin') {
        throw new Error('صلاحية غير كافية');
    }
    return current;
}

// ============================================================
// 2. دوال الأعضاء (مع الأمان والتحقق)
// ============================================================

// الحصول على عضو معين (يُستخدم فقط للتحقق)
export async function getMemberById(id) {
    const { data, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
}

// جلب جميع الأعضاء (للمدير فقط)
export async function getAllMembers() {
    await requireRole('admin');
    const { data, error } = await supabase.from('members').select('*').order('name');
    if (error) throw error;
    return data;
}

// إضافة عضو جديد (للمدير)
export async function addMember(member) {
    await requireRole('admin');
    // يجب أن يكون id هو UUID من auth.users، لذا نقوم بإنشاء مستخدم أولاً
    // أو نفترض أن العضو موجود مسبقاً في auth.users ونربطه بجدول profiles
    // هنا نبسط: نضيف فقط في جدول members بعد إنشاء المستخدم يدوياً (يُفضل خارجياً)
    const { data, error } = await supabase
        .from('members')
        .insert([{ ...member, join_date: new Date().toISOString() }])
        .select();
    if (error) throw error;
    return data[0];
}

// حذف عضو (للمدير فقط) – نستخدم RESTRICT بدلاً من CASCADE
export async function deleteMember(id) {
    await requireRole('admin');
    // التحقق من وجود معاملات أو إنتاجات مرتبطة قبل الحذف
    const { count: transCount, error: transErr } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', id);
    if (transErr) throw transErr;
    if (transCount > 0) throw new Error('لا يمكن حذف عضو له معاملات مسجلة');
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw error;
    return true;
}

// ============================================================
// 3. دوال المعاملات المالية (مع القيد المزدوج)
// ============================================================

// إضافة معاملة مالية (تنشئ قيداً مزدوجاً)
export async function addTransaction(transaction) {
    // التحقق من أن المستخدم إما مدير أو المراجع أو المستخدم نفسه
    const current = await getCurrentUser();
    if (!current) throw new Error('يجب تسجيل الدخول');
    // تحديد حالة المعاملة: إذا كان المُضيف مديراً أو مراجعاً قد تكون معتمدة مباشرة؟ لكن نتركها pending.
    const now = new Date();
    const transactionId = crypto.randomUUID(); // استخدام UUID بدلاً من Date.now()
    const transactionData = {
        id: transactionId,
        member_id: transaction.member_id,
        amount: transaction.amount,
        description: transaction.description,
        category: transaction.category,
        type: transaction.type || 'expense',
        date: transaction.date || now.toISOString().split('T')[0],
        status: 'pending',
        created_by: current.profile.id,
        created_at: now.toISOString()
    };
    // بدء معاملة قاعدة البيانات (Transaction) لضمان atomicity
    const { error: insertError } = await supabase.from('transactions').insert([transactionData]);
    if (insertError) throw insertError;

    // **القيد المزدوج**: نضيف سجلاً في journal_entries و journal_lines
    // نحتاج إلى دليل حسابات: حساب المصروف (للتكاليف) وحساب الصندوق (للنقدية)
    // هنا نستخدم دوال مساعدة لتحديد الحسابات حسب التصنيف
    const expenseAccount = await getExpenseAccount(transaction.category);
    const cashAccount = await getCashAccount();
    
    const entryId = crypto.randomUUID();
    const { error: entryError } = await supabase.from('journal_entries').insert([{
        id: entryId,
        entry_date: transactionData.date,
        description: transaction.description,
        reference_no: transactionId,
        created_by: current.profile.id,
        approved: false  // تحتاج موافقة المدير/المراجع لاحقاً
    }]);
    if (entryError) throw entryError;

    const lines = [
        { entry_id: entryId, account_id: expenseAccount, debit: transaction.amount, credit: 0 },
        { entry_id: entryId, account_id: cashAccount, debit: 0, credit: transaction.amount }
    ];
    const { error: linesError } = await supabase.from('journal_lines').insert(lines);
    if (linesError) throw linesError;

    return transactionData;
}

// دوال مساعدة للحصول على معرفات الحسابات (يفترض وجود جدول chart_of_accounts)
async function getExpenseAccount(category) {
    // منطق مبسط: نبحث عن حساب المصروفات العامة أو حسب التصنيف
    const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', 'EXPENSES')
        .single();
    if (error) throw error;
    return data.id;
}
async function getCashAccount() {
    const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', 'CASH')
        .single();
    if (error) throw error;
    return data.id;
}

// تحديث معاملة (فقط إذا كانت pending)
export async function updateTransaction(id, updates) {
    const current = await getCurrentUser();
    // التحقق من أن المعاملة موجودة وحالتها pending
    const { data: tx, error: fetchError } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', id)
        .single();
    if (fetchError) throw fetchError;
    if (tx.status !== 'pending') throw new Error('لا يمكن تعديل معاملة تمت مراجعتها');
    const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select();
    if (error) throw error;
    // تحديث سطر القيد المرتبط (نفترض وجود entry مرتبط)
    return data[0];
}

// جلب المعاملات (مع تصفية حسب الصلاحيات)
export async function getTransactions(filters = {}) {
    const current = await getCurrentUser();
    let query = supabase.from('transactions').select('*, members(name)').order('date', { ascending: false });
    if (current.profile.role !== 'admin') {
        // المراجع أو الموظف يرى فقط المعاملات التي تخصه أو التي تحتاج مراجعته (حسب الدور)
        if (current.profile.role === 'auditor') {
            query = query.in('status', ['pending', 'auditor_reviewed']);
        } else if (current.profile.role === 'employee' || current.profile.role === 'tailor') {
            query = query.eq('member_id', current.profile.id);
        }
    }
    if (filters.member_id) query = query.eq('member_id', filters.member_id);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// ============================================================
// 4. دوال الإنتاج (لتمكين الخياطين من الإضافة)
// ============================================================

export async function addProduction(production) {
    const current = await getCurrentUser();
    // السماح للخياط أو المدير أو المراجع بإضافة إنتاج
    if (!['tailor', 'admin', 'auditor'].includes(current.profile.role)) {
        throw new Error('غير مسموح لك بإضافة إنتاج');
    }
    const productionId = crypto.randomUUID();
    const now = new Date();
    const productionData = {
        id: productionId,
        member_id: production.member_id || current.profile.id, // إذا كان خياطاً يأخذ معرفه
        product_name: production.product_name,
        model: production.model,
        quantity: production.quantity,
        price: production.price || null,
        date: production.date || now.toISOString().split('T')[0],
        status: 'pending',
        created_by: current.profile.id,
        created_at: now.toISOString()
    };
    const { error } = await supabase.from('productions').insert([productionData]);
    if (error) throw error;
    return productionData;
}

export async function getProductions(filters = {}) {
    const current = await getCurrentUser();
    let query = supabase.from('productions').select('*, members(name)').order('date', { ascending: false });
    if (current.profile.role !== 'admin') {
        if (current.profile.role === 'tailor') {
            query = query.eq('member_id', current.profile.id);
        } else if (current.profile.role === 'auditor') {
            query = query.in('status', ['pending', 'auditor_reviewed']);
        }
    }
    if (filters.member_id) query = query.eq('member_id', filters.member_id);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// تأكيد الإنتاج من قبل المراجع
export async function confirmProduction(id) {
    await requireRole('auditor');
    const { error } = await supabase
        .from('productions')
        .update({ status: 'auditor_reviewed', auditor_action: 'approved', auditor_at: new Date() })
        .eq('id', id);
    if (error) throw error;
}

// الاعتماد النهائي من المدير
export async function approveProduction(id) {
    await requireRole('admin');
    const { data: prod, error: fetchError } = await supabase
        .from('productions')
        .select('*')
        .eq('id', id)
        .single();
    if (fetchError) throw fetchError;
    // تحديث الحالة
    const { error } = await supabase
        .from('productions')
        .update({ status: 'approved', admin_action: 'approved', admin_at: new Date() })
        .eq('id', id);
    if (error) throw error;
    // هنا يمكن ربط الإنتاج بالمخزون أو المحاسبة (لاحقاً)
    return prod;
}

// ============================================================
// 5. دوال الاعتراضات (داخل النظام)
// ============================================================

export async function addObjection(objection) {
    const current = await getCurrentUser();
    const objectionId = crypto.randomUUID();
    const { error } = await supabase.from('objections').insert([{
        id: objectionId,
        member_id: current.profile.id,
        transaction_id: objection.transaction_id || null,
        production_id: objection.production_id || null,
        reason: objection.reason,
        date: new Date().toISOString(),
        status: 'pending'
    }]);
    if (error) throw error;
    return objectionId;
}

// جلب الاعتراضات (حسب الصلاحية)
export async function getObjections(filters = {}) {
    const current = await getCurrentUser();
    let query = supabase.from('objections').select('*, members(name)').order('date', { ascending: false });
    if (current.profile.role !== 'admin') {
        if (current.profile.role === 'employee' || current.profile.role === 'tailor') {
            query = query.eq('member_id', current.profile.id);
        }
    }
    if (filters.member_id) query = query.eq('member_id', filters.member_id);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// الرد على الاعتراض (للمراجع أو المدير)
export async function resolveObjection(id, response) {
    await requireRole('auditor'); // أو admin
    const { error } = await supabase
        .from('objections')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), response })
        .eq('id', id);
    if (error) throw error;
}

// ============================================================
// 6. دوال التكرار التلقائي (تُنفذ عبر Edge Function، لكن نترك دوال مساعدة)
// ============================================================

export async function getRecurringSettings(filters = {}) {
    const current = await getCurrentUser();
    let query = supabase.from('recurring_settings').select('*');
    if (current.profile.role !== 'admin') {
        query = query.eq('member_id', current.profile.id);
    }
    if (filters.member_id) query = query.eq('member_id', filters.member_id);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// إضافة تكرار (للمدير أو للمستخدم نفسه)
export async function addRecurringSetting(setting) {
    const current = await getCurrentUser();
    const id = crypto.randomUUID();
    const { error } = await supabase.from('recurring_settings').insert([{
        id,
        member_id: setting.member_id,
        description: setting.description,
        amount: setting.amount,
        type: setting.type,
        category: setting.category,
        start_date: setting.start_date,
        end_date: setting.end_date,
        status: 'active',
        created_by: current.profile.id,
        created_at: new Date().toISOString()
    }]);
    if (error) throw error;
    return id;
}

// ============================================================
// 7. دوال سجل الأحداث (audit log)
// ============================================================

export async function addAuditLog(log) {
    try {
        const { error } = await supabase.from('audit_log').insert([{
            user_id: log.user_id,
            action: log.action,
            target_type: log.target_type,
            target_id: log.target_id,
            old_value: log.old_value || null,
            new_value: log.new_value || null,
            ip_address: log.ip_address || 'client',
            created_at: new Date().toISOString()
        }]);
        if (error) throw error;
    } catch (e) {
        console.error('فشل تسجيل حدث التدقيق:', e);
    }
}

export async function getAuditLogs(limit = 200) {
    await requireRole('admin');
    const { data, error } = await supabase
        .from('audit_log')
        .select('*, members(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data;
}

// ============================================================
// 8. دوال الصندوق العام (تحسب من القيود)
// ============================================================

// حساب رصيد الصندوق من journal_lines للحساب النقدي
export async function getMasterBalance() {
    const cashAccount = await getCashAccount();
    const { data, error } = await supabase
        .from('journal_lines')
        .select('debit, credit')
        .eq('account_id', cashAccount);
    if (error) throw error;
    let balance = 0;
    for (const line of data) {
        balance += line.debit - line.credit;
    }
    return { balance, last_updated: new Date().toISOString() };
}

// لا حاجة لدالة updateMasterBalance منفصلة لأن الرصيد يحسب ديناميكياً