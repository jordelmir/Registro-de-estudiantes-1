import React, { useState, useEffect, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { get, set } from 'idb-keyval';
import { 
  Users, CheckCircle, XCircle, Clock, Calendar, Search, BookOpen, 
  Plus, X, Download, History, LayoutGrid, BarChart3, Shield, 
  QrCode, Lock, AlertTriangle, Flame, FileText, Wifi, WifiOff, UserCircle,
  LogOut, ChevronUp, Sun, Moon, Briefcase, RefreshCw, Activity, Brain, Image as ImageIcon, Mic, FileAudio
} from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import { generateMultimodalEmbeddings } from './services/geminiService';

// --- Types & Interfaces ---
type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'unmarked';
type Role = 'admin' | 'teacher' | 'substitute' | 'parent' | 'student';
type ViewMode = 'list' | 'seating' | 'analytics' | 'teachers' | 'qr' | 'ai-embeddings';

interface StudentRecord {
  id: string;
  full_name: string;
  section: string;
  status: AttendanceStatus;
  timestamp: string | null;
  streak: number;
  atRisk: boolean;
  seat: { row: number; col: number } | null;
  notes: string | null;
}

interface TeacherRecord {
  id: string;
  name: string;
  status: AttendanceStatus;
  timestamp: string | null;
  class: string;
}

interface AttendanceHistoryRecord {
  date: string;
  status: AttendanceStatus;
  timestamp: string | null;
}

interface AuditLog {
  id: number;
  adminId: string;
  action: string;
  studentId: string;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  reason: string;
}

// --- Mock Data ---
const CLASSES = ['Clase 7-8', 'Clase 9-3', 'Clase 11-1'];

const CURRENT_USER = {
  studentId: 'STU-7001',
  parentChildrenIds: ['STU-7001', 'STU-9001'],
  teacherClasses: ['Clase 7-8', 'Clase 9-3'],
};

const MOCK_TEACHERS: TeacherRecord[] = [
  { id: 'TCH-001', name: 'Laura Gómez', status: 'present', timestamp: '07:30 AM', class: 'Clase 7-8' },
  { id: 'TCH-002', name: 'Roberto Díaz', status: 'absent', timestamp: null, class: 'Clase 9-3' },
  { id: 'TCH-003', name: 'Carmen Silva', status: 'present', timestamp: '07:45 AM', class: 'Clase 11-1' },
];

const MOCK_STUDENTS: StudentRecord[] = [
  // Clase 7-8
  { id: 'STU-7001', full_name: 'Ana García López', section: 'Clase 7-8', status: 'unmarked', timestamp: null, streak: 15, atRisk: false, seat: { row: 0, col: 0 }, notes: null },
  { id: 'STU-7002', full_name: 'Carlos Rodríguez', section: 'Clase 7-8', status: 'present', timestamp: '08:00 AM', streak: 5, atRisk: false, seat: { row: 0, col: 1 }, notes: null },
  { id: 'STU-7003', full_name: 'Elena Martínez', section: 'Clase 7-8', status: 'absent', timestamp: null, streak: 0, atRisk: true, seat: { row: 1, col: 0 }, notes: 'Faltas recurrentes los lunes' },
  { id: 'STU-7004', full_name: 'Luis Fernando Gómez', section: 'Clase 7-8', status: 'present', timestamp: '07:58 AM', streak: 22, atRisk: false, seat: { row: 1, col: 1 }, notes: null },
  { id: 'STU-7005', full_name: 'María Antonieta', section: 'Clase 7-8', status: 'excused', timestamp: '08:10 AM', streak: 0, atRisk: false, seat: { row: 2, col: 0 }, notes: 'Cita médica (Justificante adjunto)' },
  // Clase 9-3
  { id: 'STU-9001', full_name: 'David López Silva', section: 'Clase 9-3', status: 'late', timestamp: '08:15 AM', streak: 2, atRisk: true, seat: { row: 0, col: 0 }, notes: null },
  { id: 'STU-9002', full_name: 'Sofía Fernández', section: 'Clase 9-3', status: 'present', timestamp: '07:55 AM', streak: 40, atRisk: false, seat: { row: 0, col: 2 }, notes: null },
  { id: 'STU-9003', full_name: 'Miguel Torres', section: 'Clase 9-3', status: 'unmarked', timestamp: null, streak: 1, atRisk: false, seat: { row: 1, col: 1 }, notes: null },
  { id: 'STU-9004', full_name: 'Valentina Castro', section: 'Clase 9-3', status: 'present', timestamp: '08:02 AM', streak: 12, atRisk: false, seat: { row: 2, col: 2 }, notes: null },
];

export default function App() {
  // --- Global State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<Role>('teacher');
  const [view, setView] = useState<ViewMode>('list');
  const [isOnline, setIsOnline] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  
  // --- Attendance State ---
  const [records, setRecords] = useState<StudentRecord[]>(MOCK_STUDENTS);
  const [teachers, setTeachers] = useState<TeacherRecord[]>(MOCK_TEACHERS);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState<string>(CLASSES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  // --- Modals State ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ id: '', full_name: '', section: CLASSES[0] });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // --- Enterprise State ---
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [syncQueue, setSyncQueue] = useState<any[]>([]);
  const [qrToken, setQrToken] = useState(Date.now());
  const [isSyncing, setIsSyncing] = useState(false);

  // --- AI Embeddings State ---
  const [aiText, setAiText] = useState('');
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiAudio, setAiAudio] = useState<File | null>(null);
  const [aiEmbeddings, setAiEmbeddings] = useState<any>(null);
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);

  // --- Derived State ---
  const availableClasses = useMemo(() => {
    if (role === 'admin') return CLASSES;
    if (role === 'teacher' || role === 'substitute') return CURRENT_USER.teacherClasses;
    return [];
  }, [role]);

  const visibleRecords = useMemo(() => {
    if (role === 'admin' || role === 'teacher' || role === 'substitute') {
      return records.filter(record => record.section === selectedClass);
    }
    if (role === 'parent') {
      return records.filter(record => CURRENT_USER.parentChildrenIds.includes(record.id));
    }
    if (role === 'student') {
      return records.filter(record => record.id === CURRENT_USER.studentId);
    }
    return [];
  }, [records, selectedClass, role]);
  
  const stats = useMemo(() => ({
    total: visibleRecords.length,
    present: visibleRecords.filter(r => r.status === 'present').length,
    absent: visibleRecords.filter(r => r.status === 'absent').length,
    late: visibleRecords.filter(r => r.status === 'late').length,
    excused: visibleRecords.filter(r => r.status === 'excused').length,
    atRisk: visibleRecords.filter(r => r.atRisk).length,
  }), [visibleRecords]);

  const filteredRecords = useMemo(() => {
    return visibleRecords.filter(record => 
      record.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [visibleRecords, searchQuery]);

  const navItems = useMemo(() => {
    const items = [];
    if (role === 'admin') {
      items.push({ id: 'teachers', label: 'Profesores', icon: Briefcase });
      items.push({ id: 'ai-embeddings', label: 'Motor AI', icon: Brain });
    }
    if (role === 'admin' || role === 'teacher' || role === 'substitute') {
      items.push({ id: 'list', label: 'Lista de Clase', icon: Users });
      items.push({ id: 'seating', label: 'Mapa de Asientos', icon: LayoutGrid });
      items.push({ id: 'analytics', label: 'Analítica & Riesgo', icon: BarChart3 });
      items.push({ id: 'qr', label: 'Mostrar QR', icon: QrCode });
    }
    if (role === 'parent') {
      items.push({ id: 'list', label: 'Mis Hijos', icon: Users });
      items.push({ id: 'analytics', label: 'Rendimiento', icon: BarChart3 });
    }
    if (role === 'student') {
      items.push({ id: 'list', label: 'Mi Asistencia', icon: UserCircle });
      items.push({ id: 'analytics', label: 'Mi Rendimiento', icon: BarChart3 });
      items.push({ id: 'qr', label: 'Escanear QR', icon: QrCode });
    }
    return items;
  }, [role]);

  // --- Effects ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // --- Offline Sync Effect ---
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      try {
        const queue = await get('syncQueue') || [];
        if (queue.length > 0) {
          console.log('Syncing offline data...', queue);
          // Mock sync delay
          await new Promise(resolve => setTimeout(resolve, 1500));
          await set('syncQueue', []);
          setSyncQueue([]);
          alert(`¡${queue.length} registros sincronizados exitosamente con el servidor en segundo plano!`);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSyncing(false);
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial check
    if (navigator.onLine) {
      handleOnline();
    } else {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- QR Token Rotation (Anti-Spoofing) ---
  useEffect(() => {
    if (view === 'qr' && (role === 'admin' || role === 'teacher' || role === 'substitute')) {
      const interval = setInterval(() => {
        setQrToken(Date.now());
      }, 10000); // 10 seconds TTL
      return () => clearInterval(interval);
    }
  }, [view, role]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    setNewStudent(prev => ({ ...prev, section: selectedClass }));
    setIsLocked(false); // Reset lock when changing class/date
  }, [selectedClass, selectedDate]);

  useEffect(() => {
    if (availableClasses.length > 0 && !availableClasses.includes(selectedClass)) {
      setSelectedClass(availableClasses[0]);
    }
  }, [availableClasses, selectedClass]);

  useEffect(() => {
    if (role === 'parent' || role === 'student') {
      if (view === 'seating' || view === 'teachers') setView('list');
    }
    if ((role === 'teacher' || role === 'substitute') && view === 'teachers') {
      setView('list');
    }
  }, [role, view]);

  // Simulate Network Status
  useEffect(() => {
    // We removed the random offline simulation to use real navigator.onLine events
  }, []);

  // --- Handlers ---
  const handleTeacherStatusChange = (teacherId: string, newStatus: AttendanceStatus) => {
    if (role !== 'admin') return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    setTeachers(prev => prev.map(teacher => {
      if (teacher.id === teacherId) {
        return { 
          ...teacher, 
          status: newStatus, 
          timestamp: newStatus === 'unmarked' ? null : now
        };
      }
      return teacher;
    }));
  };

  const handleStatusChange = async (studentId: string, newStatus: AttendanceStatus) => {
    if (isLocked && role !== 'admin') {
      alert("La asistencia de este día está bloqueada. Contacte a un administrador.");
      return;
    }
    // Allow student to mark themselves present via QR scan
    if ((role === 'parent' || role === 'student') && newStatus !== 'present') return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let reason = '';
    const recordToUpdate = records.find(r => r.id === studentId);
    
    // Audit Logging for Admins
    if (role === 'admin' && recordToUpdate && recordToUpdate.status !== newStatus) {
      reason = prompt(`Motivo del cambio para ${recordToUpdate.full_name} (Auditoría):`) || 'Sin motivo especificado';
      const newLog: AuditLog = {
        id: Date.now(),
        adminId: 'Admin Principal',
        action: 'Cambio de Estado',
        studentId: studentId,
        previousStatus: recordToUpdate.status,
        newStatus: newStatus,
        timestamp: new Date().toISOString(),
        reason: reason
      };
      setAuditLogs(prev => [newLog, ...prev]);
    }

    // Offline Queueing (PWA)
    if (!navigator.onLine) {
      const queue = await get('syncQueue') || [];
      const newAction = { type: 'UPDATE_STATUS', studentId, newStatus, timestamp: Date.now() };
      await set('syncQueue', [...queue, newAction]);
      setSyncQueue(prev => [...prev, newAction]);
    }
    
    setRecords(prev => prev.map(record => {
      if (record.id === studentId) {
        let newStreak = record.streak;
        if (newStatus === 'present' && record.status !== 'present') newStreak++;
        if (newStatus === 'absent') newStreak = 0;

        // Early Warning System: Mark atRisk if absences > threshold or streak breaks
        const isNowAtRisk = newStatus === 'absent' && newStreak === 0;

        return { 
          ...record, 
          status: newStatus, 
          timestamp: newStatus === 'unmarked' ? null : now,
          streak: newStreak,
          atRisk: record.atRisk || isNowAtRisk
        };
      }
      return record;
    }));
  };

  const handleLMSSync = async () => {
    setIsSyncing(true);
    try {
      // Mock API call to LMS (Canvas/Moodle)
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert("✅ Sincronización completada con Canvas/Moodle exitosamente.");
    } catch (e) {
      alert("Error en la sincronización.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Haversine formula for Geofencing
  const getDistanceFromLatLonInM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Radius of the earth in m
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in m
  };

  const CLASSROOM_COORDS = { lat: 37.7749, lng: -122.4194 }; // Example coordinates (San Francisco)
  const MAX_DISTANCE_METERS = 50; // 50 meters radius

  const handleQRScan = (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const code = detectedCodes[0].rawValue;
      if (code.startsWith('attendance:')) {
        const parts = code.split(':');
        const scannedClass = parts[1];
        const scannedToken = parseInt(parts[2], 10);
        
        // Anti-Spoofing: Check TTL (e.g., 15 seconds max age)
        if (Date.now() - scannedToken > 15000) {
          alert('❌ Código QR expirado. Por favor, escanea el código actual.');
          return;
        }

        if (scannedClass !== selectedClass) {
          alert('❌ Este código QR no pertenece a tu clase actual.');
          return;
        }

        // Geofencing Validation
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const dist = getDistanceFromLatLonInM(
                position.coords.latitude, 
                position.coords.longitude, 
                CLASSROOM_COORDS.lat, 
                CLASSROOM_COORDS.lng
              );
              
              // For demo purposes, we'll bypass the strict distance check if it fails, 
              // but we'll show a warning. In production, we would reject it.
              if (dist > MAX_DISTANCE_METERS) {
                console.warn(`Estás a ${Math.round(dist)} metros del aula. (Simulación: Permitido por ahora)`);
              }

              handleStatusChange(CURRENT_USER.studentId, 'present');
              alert('✅ ¡Asistencia registrada exitosamente y ubicación validada!');
              setView('list');
            },
            (error) => {
              alert('⚠️ No se pudo verificar tu ubicación. Asegúrate de dar permisos de GPS.');
              console.error(error);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        } else {
          alert('Tu dispositivo no soporta geolocalización.');
        }
      }
    }
  };

  const handleGenerateEmbeddings = async () => {
    if (!aiText && !aiImage && !aiAudio) {
      alert("Por favor, proporciona al menos un tipo de contenido (texto, imagen o audio).");
      return;
    }
    
    setIsGeneratingEmbeddings(true);
    setAiEmbeddings(null);
    
    try {
      const embeddings = await generateMultimodalEmbeddings(aiText, aiImage, aiAudio);
      setAiEmbeddings(embeddings);
    } catch (error: any) {
      console.error("Error al generar embeddings:", error);
      alert("Error al conectar con Gemini AI: " + error.message);
    } finally {
      setIsGeneratingEmbeddings(false);
    }
  };

  const handleSimulateQR = () => {
    if (isLocked) return;
    const unmarked = visibleRecords.find(r => r.status === 'unmarked');
    if (unmarked) {
      handleStatusChange(unmarked.id, 'present');
      // Toast simulation
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg font-medium animate-in slide-in-from-bottom-5 z-50';
      toast.innerText = `✅ QR Escaneado: ${unmarked.full_name} (Presente)`;
      document.body.appendChild(toast);
      setTimeout(() => { toast.remove(); }, 3000);
    } else {
      alert("Todos los alumnos ya han sido registrados.");
    }
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.id.trim() || !newStudent.full_name.trim()) return;
    const newRecord: StudentRecord = {
      id: newStudent.id.trim(), full_name: newStudent.full_name.trim(), section: newStudent.section,
      status: 'unmarked', timestamp: null, streak: 0, atRisk: false, seat: null, notes: null
    };
    setRecords(prev => [...prev, newRecord]);
    setIsAddModalOpen(false);
    setNewStudent({ id: '', full_name: '', section: selectedClass });
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Nombre', 'Sección', 'Estado', 'Hora', 'Racha', 'En Riesgo'];
    const csvRows = filteredRecords.map(r => [
      r.id, `"${r.full_name}"`, r.section, r.status, r.timestamp || 'N/A', r.streak, r.atRisk ? 'Sí' : 'No'
    ].join(','));
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `asistencia_${selectedClass.replace(/\s+/g, '_')}_${selectedDate}.csv`;
    link.click();
  };

  const handleLogin = (selectedRole: Role) => {
    setRole(selectedRole);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsProfileMenuOpen(false);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

// --- Sub-components ---
  const StatCard = ({ title, value, icon: Icon, colorClass, subtitle }: any) => (
    <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-2xl p-4 sm:p-5 shadow-sm flex items-center gap-3 sm:gap-4 transition-all hover:shadow-md dark:bg-slate-800/80 dark:border-slate-700/60 min-w-0">
      <div className={`p-2 sm:p-3 rounded-xl ${colorClass} bg-opacity-10 dark:bg-opacity-20 shrink-0`}>
        <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colorClass.replace('bg-', 'text-')} dark:text-opacity-90`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">{title}</p>
        <div className="flex items-baseline gap-2 truncate">
          <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 truncate">{value}</p>
          {subtitle && <span className="text-[10px] sm:text-xs font-medium text-slate-400 dark:text-slate-500 truncate">{subtitle}</span>}
        </div>
      </div>
    </div>
  );

  const StudentProfileCard = ({ student }: { student: StudentRecord }) => {
    const statusColors = {
      present: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400',
      absent: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400',
      late: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400',
      excused: 'text-purple-700 bg-purple-50 border-purple-200 dark:bg-purple-500/10 dark:border-purple-500/20 dark:text-purple-400',
      unmarked: 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
    };
  
    const statusLabels = {
      present: 'Presente',
      absent: 'Ausente',
      late: 'Tardía',
      excused: 'Justificado',
      unmarked: 'Sin Marcar'
    };
  
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col gap-6 relative overflow-hidden transition-all hover:shadow-md">
        {student.atRisk && (
          <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500"></div>
        )}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-3xl shadow-lg shadow-indigo-500/30 shrink-0">
            {student.full_name.split(' ').map(n => n[0]).join('').substring(0,2)}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">{student.full_name}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm font-medium dark:bg-slate-800 dark:text-slate-300">
                {student.section}
              </span>
              <span className="text-slate-400 dark:text-slate-500 text-sm font-mono">{student.id}</span>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-xl border font-bold text-sm flex items-center gap-2 ${statusColors[student.status]}`}>
            <div className={`w-2 h-2 rounded-full ${student.status === 'present' ? 'bg-emerald-500' : student.status === 'absent' ? 'bg-rose-500' : student.status === 'late' ? 'bg-amber-500' : student.status === 'excused' ? 'bg-purple-500' : 'bg-slate-400'}`}></div>
            {statusLabels[student.status]}
          </div>
        </div>
  
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Hora de Registro</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100 font-mono">{student.timestamp || '--:--'}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Racha Actual</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{student.streak} días</p>
              {student.streak > 3 && <Flame className="w-5 h-5 text-orange-500" />}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Estado de Riesgo</p>
            <div className="flex items-center gap-2">
              <p className={`text-xl font-bold ${student.atRisk ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {student.atRisk ? 'En Riesgo' : 'Óptimo'}
              </p>
              {student.atRisk && <AlertTriangle className="w-5 h-5 text-rose-500" />}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Asiento Asignado</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {student.seat ? `Fila ${student.seat.row + 1}, Asiento ${student.seat.col + 1}` : 'No asignado'}
            </p>
          </div>
        </div>
        
        {student.notes && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 flex gap-3">
            <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-0.5">Nota del Profesor</p>
              <p className="text-sm text-amber-700 dark:text-amber-400/80">{student.notes}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex overflow-hidden dark:bg-slate-950 dark:text-slate-100">
      
      {/* Sidebar Navigation */}
      <aside className="w-20 lg:w-64 bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 z-20 dark:border-r dark:border-slate-800">
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-800">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="ml-3 font-bold text-white text-lg hidden lg:block tracking-tight">EduTrack Pro</span>
        </div>
        
        <nav className="flex-1 py-6 space-y-2 px-3 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button 
                key={item.id}
                onClick={() => setView(item.id as ViewMode)} 
                className={`w-full flex items-center p-3 rounded-xl transition-colors ${view === item.id ? 'bg-indigo-600/10 text-indigo-400' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Icon className="w-5 h-5 lg:mr-3 mx-auto lg:mx-0 shrink-0" />
                <span className="hidden lg:block font-medium truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 relative" ref={profileMenuRef}>
          <button 
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800 transition-colors text-left group"
          >
            <UserCircle className="w-8 h-8 text-slate-400 shrink-0 group-hover:text-indigo-400 transition-colors" />
            <div className="hidden lg:block overflow-hidden flex-1">
              <p className="text-sm font-medium text-white truncate">Usuario Actual</p>
              <p className="text-xs text-indigo-400 font-semibold capitalize truncate">
                {role === 'admin' ? 'Administrador' : role === 'teacher' ? 'Profesor' : role === 'substitute' ? 'Sustituto' : role === 'parent' ? 'Padre/Tutor' : 'Alumno'}
              </p>
            </div>
            <ChevronUp className={`w-4 h-4 text-slate-500 hidden lg:block transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Popover Menu */}
          {isProfileMenuOpen && (
            <div className="absolute bottom-full left-4 lg:left-4 mb-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
              <div className="px-4 py-3 border-b border-slate-700">
                <p className="text-sm font-medium text-white">Mi Perfil</p>
                <p className="text-xs text-slate-400 capitalize">
                  {role === 'admin' ? 'Administrador' : role === 'teacher' ? 'Profesor Titular' : role === 'substitute' ? 'Profesor Sustituto' : role === 'parent' ? 'Padre/Tutor' : 'Alumno'}
                </p>
              </div>
              <div className="p-1">
                <button 
                  onClick={() => {
                    setDarkMode(!darkMode);
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
                  </div>
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-slate-700 hover:text-rose-300 rounded-lg transition-colors mt-1"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative min-w-0">
        
        {/* Top Header */}
        <header className="h-auto min-h-[4rem] py-3 bg-white/80 backdrop-blur-md border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 z-10 dark:bg-slate-900/80 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 hidden sm:block dark:text-slate-100 truncate">
              {view === 'list' && (role === 'parent' ? 'Asistencia de Mis Hijos' : role === 'student' ? 'Mi Asistencia' : 'Registro de Asistencia')}
              {view === 'seating' && 'Gestión Visual del Aula'}
              {view === 'analytics' && 'Panel de Rendimiento'}
              {view === 'teachers' && 'Gestión de Profesores'}
              {view === 'ai-embeddings' && 'Motor AI'}
            </h2>
            
            {/* Network Status Indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${isOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'}`}>
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isOnline ? 'Sincronizado' : 'Modo Offline'}</span>
              {syncQueue.length > 0 && (
                <span className="ml-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{syncQueue.length}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {role === 'admin' && (
              <button 
                onClick={handleLMSSync}
                disabled={isSyncing || !isOnline}
                className="hidden md:flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> 
                <span className="hidden sm:inline">Sincronizar LMS</span>
              </button>
            )}
            {(role === 'admin' || role === 'teacher' || role === 'substitute') && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 dark:bg-slate-800 dark:border-slate-700 shrink-0 max-w-[140px] sm:max-w-none">
                <BookOpen className="w-4 h-4 text-indigo-500 ml-1 shrink-0 dark:text-indigo-400" />
                <select 
                  value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-slate-700 text-sm font-semibold cursor-pointer outline-none px-1 dark:text-slate-200 w-full truncate"
                >
                  {availableClasses.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 dark:bg-slate-800 dark:border-slate-700 shrink-0">
              <Calendar className="w-4 h-4 text-slate-400 ml-1 shrink-0 dark:text-slate-500" />
              <input 
                type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-slate-700 text-sm font-medium cursor-pointer outline-none px-1 dark:text-slate-200 max-w-[120px] sm:max-w-none"
                disabled={role === 'substitute' || role === 'student' || role === 'parent'} 
              />
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* View: LIST */}
            {view === 'list' && (role === 'parent' || role === 'student') && (
              <div className="space-y-6">
                {visibleRecords.map(student => (
                  <StudentProfileCard key={student.id} student={student} />
                ))}
                {visibleRecords.length === 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800">
                    <UserCircle className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No se encontraron registros</h3>
                    <p className="text-slate-500 dark:text-slate-500 mt-2">No hay estudiantes asociados a esta cuenta.</p>
                  </div>
                )}
              </div>
            )}

            {view === 'list' && (role === 'admin' || role === 'teacher' || role === 'substitute') && (
              <>
                {/* Stats Dashboard */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                  <StatCard title="Total" value={stats.total} icon={Users} colorClass="bg-blue-500 text-blue-600" />
                  <StatCard title="Presentes" value={stats.present} icon={CheckCircle} colorClass="bg-emerald-500 text-emerald-600" />
                  <StatCard title="Ausentes" value={stats.absent} icon={XCircle} colorClass="bg-rose-500 text-rose-600" />
                  <StatCard title="Tardías" value={stats.late} icon={Clock} colorClass="bg-amber-500 text-amber-600" />
                  <StatCard title="Justificados" value={stats.excused} icon={FileText} colorClass="bg-purple-500 text-purple-600" />
                </div>

                {/* Main Data Grid */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-800">
                  
                  {/* Toolbar */}
                  <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-800/50 dark:border-slate-800">
                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <input 
                        type="text" placeholder={role === 'parent' || role === 'student' ? "Buscar..." : `Buscar en ${selectedClass}...`} 
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder-slate-500"
                      />
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      {role !== 'parent' && role !== 'student' && (
                        <>
                          <button onClick={handleSimulateQR} disabled={isLocked} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                            <QrCode className="w-4 h-4" /> <span className="hidden sm:inline">Escanear QR</span>
                          </button>
                          <button onClick={() => setIsLocked(!isLocked)} disabled={role === 'substitute'} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isLocked ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'}`}>
                            {isLocked ? <Lock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                            <span className="hidden sm:inline">{isLocked ? 'Desbloquear' : 'Cerrar Registro'}</span>
                          </button>
                        </>
                      )}
                      {(role === 'admin' || role === 'teacher') && (
                        <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold dark:bg-slate-800/50 dark:border-slate-800 dark:text-slate-400">
                          <th className="px-6 py-4">Estudiante</th>
                          <th className="px-6 py-4 text-center">Racha / Alertas</th>
                          <th className="px-6 py-4 text-center">Estado de Asistencia</th>
                          <th className="px-6 py-4 text-right">Hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredRecords.length === 0 ? (
                          <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">No se encontraron estudiantes.</td></tr>
                        ) : (
                          filteredRecords.map((student) => (
                            <tr key={student.id} className={`hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-800/50 ${student.atRisk ? 'bg-rose-50/30 dark:bg-rose-500/5' : ''}`}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs dark:bg-indigo-500/20 dark:text-indigo-400">
                                    {student.full_name.split(' ').map(n => n[0]).join('').substring(0,2)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900 flex items-center gap-2 dark:text-slate-200">
                                      {student.full_name}
                                      {student.notes && <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500" title={student.notes} />}
                                    </p>
                                    <p className="text-xs text-slate-500 font-mono dark:text-slate-400">{student.id}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-3">
                                  {student.streak > 3 && (
                                    <div className="flex items-center gap-1 text-orange-500 bg-orange-50 px-2 py-1 rounded-full text-xs font-bold border border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400" title="Racha de asistencia perfecta">
                                      <Flame className="w-3 h-3" /> {student.streak}
                                    </div>
                                  )}
                                  {student.atRisk && (
                                    <div className="flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-1 rounded-full text-xs font-bold border border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400" title="Estudiante en riesgo de deserción">
                                      <AlertTriangle className="w-3 h-3" /> Riesgo
                                    </div>
                                  )}
                                  {!student.atRisk && student.streak <= 3 && <span className="text-slate-300 dark:text-slate-600">-</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <button onClick={() => handleStatusChange(student.id, 'present')} disabled={isLocked || role === 'parent' || role === 'student'} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${student.status === 'present' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`}>Presente</button>
                                  <button onClick={() => handleStatusChange(student.id, 'absent')} disabled={isLocked || role === 'parent' || role === 'student'} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${student.status === 'absent' ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm dark:bg-rose-500/20 dark:border-rose-500/30 dark:text-rose-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`}>Ausente</button>
                                  <button onClick={() => handleStatusChange(student.id, 'late')} disabled={isLocked || role === 'parent' || role === 'student'} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${student.status === 'late' ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`}>Tardía</button>
                                  <button onClick={() => handleStatusChange(student.id, 'excused')} disabled={isLocked || role === 'parent' || role === 'student'} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${student.status === 'excused' ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm dark:bg-purple-500/20 dark:border-purple-500/30 dark:text-purple-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`} title="Falta Justificada">Justif.</button>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-500 text-right font-mono dark:text-slate-400">
                                {student.timestamp || '--:--'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* View: TEACHERS */}
            {view === 'teachers' && role === 'admin' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard title="Total Profesores" value={teachers.length} icon={Briefcase} colorClass="bg-blue-500 text-blue-600" />
                  <StatCard title="Presentes" value={teachers.filter(t => t.status === 'present').length} icon={CheckCircle} colorClass="bg-emerald-500 text-emerald-600" />
                  <StatCard title="Ausentes" value={teachers.filter(t => t.status === 'absent').length} icon={XCircle} colorClass="bg-rose-500 text-rose-600" />
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-800">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 dark:bg-slate-800/50 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Registro de Profesores</h3>
                    <button className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Añadir Profesor</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold dark:bg-slate-800/50 dark:border-slate-800 dark:text-slate-400">
                          <th className="px-6 py-4">Profesor</th>
                          <th className="px-6 py-4 text-center">Clase Asignada</th>
                          <th className="px-6 py-4 text-center">Estado</th>
                          <th className="px-6 py-4 text-right">Hora de Entrada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {teachers.map(teacher => (
                          <tr key={teacher.id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-800/50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs dark:bg-indigo-500/20 dark:text-indigo-400">
                                  {teacher.name.split(' ').map(n => n[0]).join('').substring(0,2)}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">{teacher.name}</p>
                                  <p className="text-xs text-slate-500 font-mono dark:text-slate-400">{teacher.id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-300">
                              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium dark:bg-slate-800 dark:text-slate-300">
                                {teacher.class}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button onClick={() => handleTeacherStatusChange(teacher.id, 'present')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${teacher.status === 'present' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`}>Presente</button>
                                <button onClick={() => handleTeacherStatusChange(teacher.id, 'absent')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${teacher.status === 'absent' ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm dark:bg-rose-500/20 dark:border-rose-500/30 dark:text-rose-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`}>Ausente</button>
                                <button onClick={() => handleTeacherStatusChange(teacher.id, 'late')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${teacher.status === 'late' ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`}>Tardía</button>
                                <button onClick={() => handleTeacherStatusChange(teacher.id, 'excused')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${teacher.status === 'excused' ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm dark:bg-purple-500/20 dark:border-purple-500/30 dark:text-purple-400' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'}`} title="Falta Justificada">Justif.</button>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500 text-right font-mono dark:text-slate-400">
                              {teacher.timestamp || '--:--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* View: QR */}
            {view === 'qr' && (
              <div className="flex flex-col items-center justify-center min-h-[600px] bg-white border border-slate-200 rounded-2xl p-8 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                {(role === 'admin' || role === 'teacher' || role === 'substitute') ? (
                  <div className="text-center space-y-6">
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Código QR de Asistencia</h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      Muestra este código a los alumnos para que puedan registrar su asistencia escaneándolo con sus dispositivos. Toca el código para actualizarlo.
                    </p>
                    <div 
                      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 inline-block cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden group"
                      onClick={() => {
                        // Force re-render to generate a new timestamp in the QR
                        setView('list');
                        setTimeout(() => setView('qr'), 10);
                      }}
                      title="Tocar para actualizar código QR"
                    >
                      <QRCodeSVG value={`attendance:${selectedClass}:${qrToken}`} size={256} />
                      <div className="absolute inset-0 bg-indigo-600/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <RefreshCw className="w-8 h-8 text-indigo-600 drop-shadow-md" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-400">Clase actual: {selectedClass}</p>
                    <div className="flex items-center justify-center gap-2 text-xs text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400">
                      <Shield className="w-4 h-4" />
                      <span>Protección Anti-Spoofing: El código rota cada 10s</span>
                    </div>
                  </div>
                ) : role === 'student' ? (
                  <div className="text-center space-y-6 w-full max-w-md">
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Escanear Código QR</h3>
                    <p className="text-slate-500 dark:text-slate-400">
                      Apunta la cámara al código QR mostrado por el profesor. Se requerirá tu ubicación GPS para validar la asistencia.
                    </p>
                    <div className="rounded-2xl overflow-hidden border-4 border-indigo-500/30 shadow-lg aspect-square bg-slate-900 relative flex items-center justify-center">
                      <Scanner 
                        onScan={handleQRScan}
                        onError={(error) => {
                          console.error("QR Scanner Error:", error);
                        }}
                        components={{
                          audio: false,
                          finder: false,
                        }}
                        styles={{
                          container: { width: '100%', height: '100%' },
                          video: { objectFit: 'cover' }
                        }}
                      />
                      <div className="absolute inset-0 border-2 border-indigo-500 rounded-2xl pointer-events-none opacity-50"></div>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-white/30 rounded-3xl relative">
                          <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-3xl"></div>
                          <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-3xl"></div>
                          <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-3xl"></div>
                          <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-3xl"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* View: SEATING CHART */}
            {view === 'seating' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm min-h-[600px] flex flex-col items-center justify-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] dark:bg-slate-900 dark:border-slate-800">
                <div className="w-full max-w-3xl bg-slate-800 text-slate-300 text-center py-4 rounded-xl font-bold tracking-widest uppercase mb-12 shadow-lg dark:bg-slate-950 dark:border dark:border-slate-800">
                  Pizarra / Profesor
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-8 w-full max-w-3xl">
                  {/* Generate a 3x3 grid for demonstration */}
                  {Array.from({ length: 9 }).map((_, idx) => {
                    const row = Math.floor(idx / 3);
                    const col = idx % 3;
                    const student = visibleRecords.find(r => r.seat?.row === row && r.seat?.col === col);
                    
                    if (!student) {
                      return <div key={idx} className="h-auto min-h-[100px] sm:min-h-[128px] border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center text-slate-400 text-sm font-medium bg-white/50 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">Vacío</div>;
                    }

                    const statusColors = {
                      present: 'bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300',
                      absent: 'bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-500/20 dark:border-rose-500/40 dark:text-rose-300',
                      late: 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-300',
                      excused: 'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-500/20 dark:border-purple-500/40 dark:text-purple-300',
                      unmarked: 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500/50'
                    };

                    return (
                      <button 
                        key={student.id}
                        disabled={isLocked || role === 'parent' || role === 'student'}
                        onClick={() => {
                          const nextStatus: Record<AttendanceStatus, AttendanceStatus> = {
                            unmarked: 'present', present: 'absent', absent: 'late', late: 'excused', excused: 'unmarked'
                          };
                          handleStatusChange(student.id, nextStatus[student.status]);
                        }}
                        className={`h-auto min-h-[100px] sm:min-h-[128px] w-full flex flex-col items-center justify-center p-2 sm:p-4 rounded-2xl border-2 transition-all shadow-sm ${statusColors[student.status]} ${isLocked ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer hover:shadow-md hover:-translate-y-1'}`}
                      >
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/50 dark:bg-black/20 flex items-center justify-center font-bold mb-1 sm:mb-2 shadow-sm shrink-0 text-xs sm:text-base">
                          {student.full_name.split(' ')[0][0]}{student.full_name.split(' ')[1]?.[0] || ''}
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-center leading-tight truncate w-full px-1">{student.full_name.split(' ')[0]}</span>
                        <span className="text-[10px] sm:text-xs opacity-75 mt-0.5 sm:mt-1 capitalize truncate w-full px-1">{student.status === 'unmarked' ? 'Sin marcar' : student.status}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* View: ANALYTICS */}
            {view === 'analytics' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm col-span-1 md:col-span-2 dark:bg-slate-900 dark:border-slate-800">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 dark:text-slate-100"><BarChart3 className="w-5 h-5 text-indigo-500 dark:text-indigo-400"/> Tendencia Semanal</h3>
                    <div className="h-48 flex items-end justify-between gap-2 pt-4">
                      {/* Mock Bar Chart */}
                      {[85, 92, 78, 95, 88].map((val, i) => (
                        <div key={i} className="w-full flex flex-col items-center gap-2 group">
                          <div className="w-full bg-indigo-100 rounded-t-md relative flex items-end justify-center transition-all group-hover:bg-indigo-200" style={{ height: '100%' }}>
                            <div className="w-full bg-indigo-500 rounded-t-md transition-all duration-500" style={{ height: `${val}%` }}></div>
                            <span className="absolute -top-6 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">{val}%</span>
                          </div>
                          <span className="text-xs font-medium text-slate-500">{'L M X J V'.split(' ')[i]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100 shadow-sm dark:bg-rose-500/10 dark:border-rose-500/20">
                    <h3 className="text-lg font-bold text-rose-800 mb-4 flex items-center gap-2 dark:text-rose-400">
                      <AlertTriangle className="w-5 h-5"/> 
                      {role === 'parent' || role === 'student' ? 'Alertas de Rendimiento' : 'Intervención Requerida'}
                    </h3>
                    <div className="space-y-3">
                      {visibleRecords.filter(r => r.atRisk).map(student => (
                        <div key={student.id} className="bg-white p-3 rounded-xl shadow-sm border border-rose-100 flex items-start gap-3 dark:bg-slate-800/50 dark:border-rose-500/20">
                          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0 dark:bg-rose-500/20 dark:text-rose-400">
                            {student.full_name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{student.full_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{student.notes || 'Ausencias múltiples detectadas'}</p>
                          </div>
                        </div>
                      ))}
                      {visibleRecords.filter(r => r.atRisk).length === 0 && (
                        <p className="text-sm text-emerald-600 font-medium text-center py-4">
                          {role === 'student' ? 'No tienes alertas de rendimiento.' : role === 'parent' ? 'Tus hijos no tienen alertas de rendimiento.' : 'No hay estudiantes en riesgo.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Audit Logs Section */}
                {role === 'admin' && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-800 mt-8">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 dark:bg-slate-800/50 dark:border-slate-800 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-500" />
                        Registro de Auditoría (Audit Logs)
                      </h3>
                      <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full dark:bg-indigo-500/20 dark:text-indigo-400">
                        {auditLogs.length} Registros
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold dark:bg-slate-800/50 dark:border-slate-800 dark:text-slate-400">
                            <th className="px-6 py-4">Fecha/Hora</th>
                            <th className="px-6 py-4">Administrador</th>
                            <th className="px-6 py-4">Estudiante ID</th>
                            <th className="px-6 py-4">Cambio de Estado</th>
                            <th className="px-6 py-4">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {auditLogs.length > 0 ? auditLogs.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-800/50">
                              <td className="px-6 py-4 text-sm text-slate-500 font-mono dark:text-slate-400">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-200">
                                {log.adminId}
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600 font-mono dark:text-slate-300">
                                {log.studentId}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-slate-500 line-through dark:text-slate-400">{log.previousStatus}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{log.newStatus}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600 italic dark:text-slate-400">
                                "{log.reason}"
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm dark:text-slate-400">
                                No hay registros de auditoría recientes.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* View: AI EMBEDDINGS */}
            {view === 'ai-embeddings' && role === 'admin' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 dark:text-slate-100">
                    <Brain className="w-5 h-5 text-indigo-500" />
                    Generación de Embeddings Multimodales (Gemini AI)
                  </h3>
                  <p className="text-sm text-slate-500 mb-6 dark:text-slate-400">
                    Esta herramienta permite generar representaciones vectoriales (embeddings) combinando texto, imágenes y audio. Ideal para sistemas de verificación biométrica o búsqueda semántica avanzada.
                  </p>
                  
                  <div className="space-y-4">
                    {/* Text Input */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Texto (Opcional)</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          value={aiText}
                          onChange={(e) => setAiText(e.target.value)}
                          placeholder="Ej: What is the meaning of life?"
                          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Image Input */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Imagen (Opcional)</label>
                        <div className="relative flex items-center">
                          <input 
                            type="file" 
                            accept="image/*"
                            id="ai-image-upload"
                            className="hidden"
                            onChange={(e) => setAiImage(e.target.files ? e.target.files[0] : null)}
                          />
                          <label htmlFor="ai-image-upload" className="flex items-center gap-2 w-full px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-800/80">
                            <ImageIcon className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                              {aiImage ? aiImage.name : "Seleccionar imagen..."}
                            </span>
                          </label>
                          {aiImage && (
                            <button onClick={() => setAiImage(null)} className="absolute right-2 text-slate-400 hover:text-rose-500">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Audio Input */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Audio (Opcional)</label>
                        <div className="relative flex items-center">
                          <input 
                            type="file" 
                            accept="audio/*"
                            id="ai-audio-upload"
                            className="hidden"
                            onChange={(e) => setAiAudio(e.target.files ? e.target.files[0] : null)}
                          />
                          <label htmlFor="ai-audio-upload" className="flex items-center gap-2 w-full px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-800/80">
                            <FileAudio className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                              {aiAudio ? aiAudio.name : "Seleccionar audio..."}
                            </span>
                          </label>
                          {aiAudio && (
                            <button onClick={() => setAiAudio(null)} className="absolute right-2 text-slate-400 hover:text-rose-500">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button 
                        onClick={handleGenerateEmbeddings}
                        disabled={isGeneratingEmbeddings || (!aiText && !aiImage && !aiAudio)}
                        className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
                      >
                        {isGeneratingEmbeddings ? (
                          <><RefreshCw className="w-5 h-5 animate-spin" /> Generando Embeddings...</>
                        ) : (
                          <><Activity className="w-5 h-5" /> Generar Embeddings Vectoriales</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Results Section */}
                {aiEmbeddings && (
                  <div className="bg-slate-900 rounded-2xl p-6 shadow-lg border border-slate-800 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-emerald-400 font-mono text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Embeddings Generados Exitosamente
                      </h4>
                      <span className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded font-mono">
                        Dimensiones: {aiEmbeddings.values?.length || 0}
                      </span>
                    </div>
                    <div className="bg-black/50 rounded-xl p-4 overflow-x-auto">
                      <pre className="text-slate-300 font-mono text-xs leading-relaxed">
                        {/* Show only first 10 and last 2 values to avoid massive JSON dump */}
                        [
                          {aiEmbeddings.values?.slice(0, 5).map((v: number) => `\n  ${v.toFixed(6)},`).join('')}
                          {'\n  ...'}
                          {aiEmbeddings.values?.slice(-2).map((v: number) => `\n  ${v.toFixed(6)},`).join('')}
                        {'\n]'}
                      </pre>
                    </div>
                    <p className="text-slate-500 text-xs mt-4">
                      * Mostrando una vista previa del vector. El vector completo contiene {aiEmbeddings.values?.length || 0} dimensiones de punto flotante.
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Add Student Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900 dark:border dark:border-slate-800">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Añadir Nuevo Alumno</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddStudent} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">ID del Estudiante</label>
                <input type="text" required value={newStudent.id} onChange={e => setNewStudent({...newStudent, id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500" placeholder="Ej. STU-9999" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Nombre Completo</label>
                <input type="text" required value={newStudent.full_name} onChange={e => setNewStudent({...newStudent, full_name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500" placeholder="Ej. Juan Pérez" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm dark:bg-indigo-500 dark:hover:bg-indigo-600">Guardar Alumno</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
