import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSession } from '../../context/SessionContext';
import hospitalApi from '../../services/hospital.api';
import hospitalManagementApi from '../../services/management.api';

const emptyStats = {
    totalPatients: 0,
    dailyAdmissions: 0,
    erLoad: 0,
    availableRooms: 0,
    staffOnDuty: 0,
};

export default function HospitalDashboard() {
    const navigate = useNavigate();
    const { patient, setPatient, resetSession } = useSession();
    const [stats, setStats] = useState(emptyStats);
    const [patientFlow, setPatientFlow] = useState([]);
    const [activity, setActivity] = useState([]);
    const [systemHealth, setSystemHealth] = useState(null);
    const [lookupUid, setLookupUid] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scannedNfcUid, setScannedNfcUid] = useState(null);

    useEffect(() => {
        if (!patient) {
            setScannedNfcUid(null);
        }
    }, [patient]);

    useEffect(() => {
        let active = true;

        const fetchData = async () => {
            try {
                const [statsRes, flowRes, activityRes, healthRes] = await Promise.allSettled([
                    hospitalApi.getStats(),
                    hospitalApi.getPatientFlow(),
                    hospitalApi.getRecentActivity(),
                    hospitalApi.getSystemHealth(),
                ]);

                if (!active) return;

                if (statsRes.status === 'fulfilled') setStats(statsRes.value || emptyStats);
                if (flowRes.status === 'fulfilled') setPatientFlow(flowRes.value || []);
                if (activityRes.status === 'fulfilled') setActivity(activityRes.value || []);
                if (healthRes.status === 'fulfilled') setSystemHealth(healthRes.value || null);

                const hasErrors = [statsRes, flowRes, activityRes, healthRes].some(r => r.status === 'rejected');
                setError(hasErrors ? 'Some data could not be loaded. Showing available data.' : null);
            } catch (requestError) {
                if (!active) return;
                console.error('Failed to load hospital dashboard data:', requestError);
                setError('Unable to load hospital data.');
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            active = false;
        };
    }, []);

    const maxFlow = useMemo(() => {
        const values = patientFlow.map((item) => item.value || 0);
        return Math.max(...values, 1);
    }, [patientFlow]);

    const handleStartLookup = useCallback(async (uid) => {
        const normalizedUid = uid?.trim();

        if (!normalizedUid) {
            toast.error('Enter or scan an NFC UID first.');
            return;
        }

        setLookupLoading(true);

        try {
            const patientData = await hospitalManagementApi.getPatientByNfc(normalizedUid);
            setPatient({
                ...patientData,
                name: patientData.name || patientData.fullName || 'Unknown Patient',
                location: patientData.location || 'Hospital intake',
                nfcId: patientData.nfcId || patientData.nfcUuid || patientData.nfc_uid || normalizedUid,
                nfcUuid: patientData.nfcUuid || patientData.nfcId || patientData.nfc_uid || normalizedUid,
            });
            setLookupUid(normalizedUid);
            setScannedNfcUid(normalizedUid);
            toast.success('Patient loaded successfully');
        } catch (lookupError) {
            console.error('Failed to load patient session:', lookupError);
            toast.error(lookupError.response?.data?.message || 'Unable to load patient from backend.');
        } finally {
            setLookupLoading(false);
        }
    }, [setPatient]);

    const handleHardwareScan = useCallback(async () => {
        setLookupLoading(true);

        try {
            const scanResponse = await hospitalManagementApi.scanNfc();
            if (!scanResponse?.uid) {
                throw new Error('No NFC UID was returned by the hardware bridge.');
            }

            await handleStartLookup(scanResponse.uid);
        } catch (scanError) {
            console.error('Hardware scan failed:', scanError);
            toast.error(scanError.response?.data?.message || scanError.message || 'Hardware scan failed.');
            setLookupLoading(false);
        }
    }, [handleStartLookup]);

    return (
        <div className="p-8 space-y-8 bg-slate-50 dark:bg-slate-950 min-h-full">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Hospital Overview</h1>
                    <p className="text-slate-500 mt-2">Backend-backed hospital data with estimated operational metrics and hardware status.</p>
                </div>
                {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
            </div>

            <section className="bg-white dark:bg-[#13201d] rounded-2xl p-8 border border-slate-200 dark:border-emerald-900/30 shadow-sm">
                {!patient ? (
                    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                        <div>
                            <div className="mx-auto lg:mx-0 size-16 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-4xl">
                                    contactless
                                </span>
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-slate-800 dark:text-emerald-50">
                                Start a verified patient session
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-emerald-200/60 max-w-xl">
                                Scan from the hardware bridge or enter the patient NFC UID manually to continue into OTP and biometric consent.
                            </p>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-950/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-4">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Patient NFC UID</label>
                            <input
                                type="text"
                                value={lookupUid}
                                onChange={(event) => setLookupUid(event.target.value)}
                                placeholder="Paste or type the scanned UID"
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none focus:border-emerald-500 transition-all"
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <button
                                    onClick={() => handleStartLookup(lookupUid)}
                                    disabled={lookupLoading}
                                    className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all disabled:opacity-60"
                                >
                                    {lookupLoading ? 'Loading...' : 'Load Patient'}
                                </button>
                                <button
                                    onClick={handleHardwareScan}
                                    disabled={lookupLoading}
                                    className="px-5 py-3 bg-slate-900 dark:bg-white dark:text-slate-950 text-white font-bold rounded-xl transition-all disabled:opacity-60"
                                >
                                    Scan From Hardware
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex items-center gap-6">
                                <div className="size-20 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-600/20">
                                    <span className="material-symbols-outlined text-4xl">person</span>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{patient.name}</h3>
                                    <div className="flex flex-wrap gap-4 mt-1">
                                        <span className="text-sm text-slate-500 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">fingerprint</span>
                                            {patient.healthId || patient.id}
                                        </span>
                                        <span className="text-sm text-slate-500 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">location_on</span>
                                            {patient.location || 'Hospital intake'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-4">
                                <button
                                    onClick={() => navigate('/hospital/clinical-note/auth')}
                                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined">verified_user</span>
                                    Start Consent Flow
                                </button>
                                <button
                                    onClick={() => navigate('/hospital/emergency/confirm')}
                                    className="px-6 py-3 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-bold rounded-xl border border-red-200 dark:border-red-800 hover:bg-red-100 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined">emergency</span>
                                    Emergency Override
                                </button>
                                <button
                                    onClick={resetSession}
                                    className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                >
                                    End Session
                                </button>
                            </div>
                        </div>
                        
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl p-6 border border-emerald-200 dark:border-emerald-800">
                            <div className="flex items-center gap-4">
                                <div className="size-14 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                                    <span className="material-symbols-outlined text-3xl">contactless</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">NFC Card UID</p>
                                    <p className="text-2xl font-mono font-bold text-slate-800 dark:text-white tracking-wider">
                                        {scannedNfcUid || patient.nfcId || patient.nfcUuid || 'Not Available'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="size-3 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Card Linked</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Stat label="Total Patients" value={stats.totalPatients} icon="group" tone="blue" />
                <Stat label="Daily Admissions" value={stats.dailyAdmissions} icon="login" tone="emerald" />
                <Stat label="ER Load" value={`${stats.erLoad || 0}%`} icon="emergency" tone="red" />
                <Stat label="Staff On Duty" value={stats.staffOnDuty} icon="badge" tone="amber" />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
                <PatientFlowChart loading={loading} patientFlow={patientFlow} maxFlow={maxFlow} />
                <SystemHealth systemHealth={systemHealth} />
            </section>

            <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800 dark:text-white">Recent Activity</h3>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Audit-backed</span>
                </div>

                {activity.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-8 text-center text-slate-500">
                        No recent activity found.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {activity.slice(0, 6).map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 p-4">
                                <div>
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">{item.action?.replace(/_/g, ' ')}</p>
                                    <p className="text-sm text-slate-500">{item.user} {'->'} {item.target}</p>
                                </div>
                                <span className="text-xs font-mono text-slate-400">{new Date(item.timestamp).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

const Stat = memo(function Stat({ label, value, icon, tone }) {
    const tones = {
        blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300',
        emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300',
        red: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300',
        amber: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300',
    };

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div className={`size-12 rounded-xl flex items-center justify-center ${tones[tone] || tones.blue}`}>
                    <span className="material-symbols-outlined">{icon}</span>
                </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{label}</p>
            <h4 className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{value ?? 0}</h4>
        </div>
    );
});

const PatientFlowChart = memo(function PatientFlowChart({ loading, patientFlow, maxFlow }) {
    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 h-[400px] flex flex-col shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800 dark:text-white">Patient Flow Trend</h3>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Last 7 days</span>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center text-slate-400">Loading chart...</div>
            ) : patientFlow.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-400">No flow data available.</div>
            ) : (
                <div className="flex-1 flex items-end gap-3 px-2">
                    {patientFlow.map((item) => {
                        const height = `${Math.max(12, Math.round(((item.value || 0) / maxFlow) * 100))}%`;

                        return (
                            <div key={`${item.day}-${item.value}`} className="flex-1 flex flex-col items-center gap-2 group">
                                <div style={{ height }} className="w-full bg-emerald-500/20 group-hover:bg-emerald-500/40 rounded-t-lg transition-all relative">
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                        {item.value || 0}
                                    </div>
                                </div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase">{item.day}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

const SystemHealth = memo(function SystemHealth({ systemHealth }) {
    const getStatusString = (status) => {
        if (typeof status === 'string') return status;
        if (typeof status === 'object' && status !== null) {
            return status.status || status.state || 'unavailable';
        }
        return 'unknown';
    };

    const services = [
        { name: 'API', status: getStatusString(systemHealth?.api) },
        { name: 'Database', status: getStatusString(systemHealth?.database) },
        { name: 'NFC Gateway', status: getStatusString(systemHealth?.services?.nfc) },
        { name: 'Fingerprint', status: getStatusString(systemHealth?.services?.fingerprint) },
        { name: 'GSM Module', status: getStatusString(systemHealth?.services?.gsm) },
    ];

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-800 dark:text-white">Service Health</h3>
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                    {systemHealth?.bridgeConfigured ? 'Bridge active' : 'Manual mode'}
                </span>
            </div>
            <div className="space-y-4">
                {services.map((service) => {
                    const healthy = ['healthy', 'online', 'connected'].includes(String(service.status).toLowerCase());

                    return (
                        <div key={service.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-3">
                                <div className={`size-2 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-orange-500'}`}></div>
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{service.name}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">{service.status}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-6 text-xs text-slate-400">Last check: {systemHealth?.lastCheck ? new Date(systemHealth.lastCheck).toLocaleString() : 'N/A'}</p>
        </div>
    );
});
