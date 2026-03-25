import { supabase } from '../lib/supabase';
export { supabase };

export const getStudents = async () => {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data;
};

export const updateStudentStatus = async (id: string, status: string, timestamp: string | null) => {
  const { error } = await supabase
    .from('students')
    .update({ status, timestamp_record: timestamp })
    .eq('id', id);
  if (error) throw error;
};

export const getTeachers = async () => {
  const { data, error } = await supabase
    .from('teachers')
    .select('*');
  if (error) throw error;
  return data;
};

export const logAudit = async (log: any) => {
  const { error } = await supabase
    .from('audit_logs')
    .insert([{
      admin_id: log.adminId,
      action: log.action,
      student_id: log.studentId,
      previous_status: log.previousStatus,
      new_status: log.newStatus,
      reason: log.reason
    }]);
  if (error) throw error;
};
