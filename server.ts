import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { clinicDb } from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// API Routes
app.get('/api/clinic-info', (_req: Request, res: Response) => {
  try {
    const settings = clinicDb.getSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clinic-info', (req: Request, res: Response) => {
  try {
    const updated = clinicDb.updateSettings(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Appointments
app.get('/api/appointments', (req: Request, res: Response) => {
  try {
    const { date, clinicId, status, search } = req.query as Record<string, string>;
    const list = clinicDb.getAppointments({ date, clinicId, status, search });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/appointments/lookup', (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query.trim()) {
      res.json([]);
      return;
    }
    const results = clinicDb.lookupAppointment(query);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', (req: Request, res: Response) => {
  try {
    const {
      patientName,
      patientAgeYears,
      patientAgeMonths,
      patientGender,
      guardianName,
      guardianRelation,
      guardianPhone,
      guardianEmail,
      clinicLocationId,
      date,
      timeSlot,
      reasonForVisit,
      isFollowUp,
      fee,
      notes,
    } = req.body;

    if (!patientName || !guardianName || !guardianPhone || !clinicLocationId || !date || !timeSlot) {
      res.status(400).json({ error: 'Missing required appointment fields.' });
      return;
    }

    const newApt = clinicDb.createAppointment({
      patientName,
      patientAgeYears: Number(patientAgeYears) || 0,
      patientAgeMonths: Number(patientAgeMonths) || 0,
      patientGender: patientGender || 'Male',
      guardianName,
      guardianRelation: guardianRelation || 'Parent',
      guardianPhone,
      guardianEmail: guardianEmail || '',
      clinicLocationId,
      date,
      timeSlot,
      reasonForVisit: reasonForVisit || 'General Pediatric Consultation',
      isFollowUp: Boolean(isFollowUp),
      status: 'confirmed',
      paymentStatus: 'pending',
      fee: Number(fee) || 0,
      notes: notes || '',
    });

    res.status(201).json(newApt);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/appointments/:id', (req: Request, res: Response) => {
  try {
    const updated = clinicDb.updateAppointment(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/appointments/:id', (req: Request, res: Response) => {
  try {
    const deleted = clinicDb.deleteAppointment(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Time Slots helper
app.get('/api/slots', (req: Request, res: Response) => {
  try {
    const { date, clinicLocationId } = req.query as { date?: string; clinicLocationId?: string };
    if (!date || !clinicLocationId) {
      res.status(400).json({ error: 'Date and clinicLocationId are required' });
      return;
    }

    const settings = clinicDb.getSettings();
    const location = settings.locations.find((l: any) => l.id === clinicLocationId);

    // Standard slot batches based on clinic type
    let defaultSlots: string[] = [];
    if (location?.type === 'hospital') {
      defaultSlots = [
        '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
        '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM'
      ];
    } else if (location?.type === 'telehealth') {
      defaultSlots = [
        '03:00 PM', '03:20 PM', '03:40 PM', '04:00 PM', '04:20 PM', '04:40 PM'
      ];
    } else {
      defaultSlots = [
        '05:30 PM', '05:50 PM', '06:10 PM', '06:30 PM', '06:50 PM',
        '07:10 PM', '07:30 PM', '07:50 PM', '08:10 PM', '08:30 PM',
        '08:50 PM', '09:10 PM'
      ];
    }

    const existingApts = clinicDb.getAppointments({ date, clinicId: clinicLocationId });
    const slotCounts = existingApts.reduce((acc: Record<string, number>, apt) => {
      acc[apt.timeSlot] = (acc[apt.timeSlot] || 0) + 1;
      return acc;
    }, {});

    const maxPerSlot = settings.maxPatientsPerSlot || 2;
    const slots = defaultSlots.map((time) => {
      const bookedCount = slotCounts[time] || 0;
      return {
        time,
        available: bookedCount < maxPerSlot,
        bookedCount,
        maxCapacity: maxPerSlot,
      };
    });

    res.json({ slots, location });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Patients
app.get('/api/patients', (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const patients = clinicDb.getPatients(search);
    res.json(patients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients/:id', (req: Request, res: Response) => {
  try {
    const patient = clinicDb.getPatientById(req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    const prescriptions = clinicDb.getPrescriptions(patient.id);
    const vaccinations = clinicDb.getVaccinations(patient.id);
    const appointments = clinicDb.getAppointments().filter(
      (a) => a.patientId === patient.id || (a.guardianPhone === patient.guardianPhone && a.patientName === patient.childName)
    );

    res.json({
      patient,
      prescriptions,
      vaccinations,
      appointments,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients', (req: Request, res: Response) => {
  try {
    const newPat = clinicDb.createPatient(req.body);
    res.status(201).json(newPat);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/patients/:id', (req: Request, res: Response) => {
  try {
    const updated = clinicDb.updatePatient(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Prescriptions
app.get('/api/prescriptions', (req: Request, res: Response) => {
  try {
    const patientId = req.query.patientId as string;
    const rxs = clinicDb.getPrescriptions(patientId);
    res.json(rxs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prescriptions/:id', (req: Request, res: Response) => {
  try {
    const rx = clinicDb.getPrescriptionById(req.params.id);
    if (!rx) {
      res.status(404).json({ error: 'Prescription not found' });
      return;
    }
    res.json(rx);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prescriptions', (req: Request, res: Response) => {
  try {
    const newRx = clinicDb.createPrescription(req.body);
    res.status(201).json(newRx);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vaccinations
app.get('/api/vaccinations/:patientId', (req: Request, res: Response) => {
  try {
    const list = clinicDb.getVaccinations(req.params.patientId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vaccinations', (req: Request, res: Response) => {
  try {
    const rec = clinicDb.addVaccineRecord(req.body);
    res.status(201).json(rec);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/vaccinations/:id', (req: Request, res: Response) => {
  try {
    const rec = clinicDb.updateVaccineRecord(req.params.id, req.body);
    if (!rec) {
      res.status(404).json({ error: 'Vaccine record not found' });
      return;
    }
    res.json(rec);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats
app.get('/api/stats', (_req: Request, res: Response) => {
  try {
    const stats = clinicDb.getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auth endpoint
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  // Secure staff credentials with flexible clinical access
  if (
    (username === 'doctor' && password === 'drhamid123') ||
    (username === 'admin' && password === 'admin123') ||
    (username === 'receptionist' && password === 'clinic123')
  ) {
    const role = username === 'receptionist' ? 'receptionist' : 'doctor';
    res.json({
      success: true,
      user: {
        username,
        name: role === 'doctor' ? 'Dr. Hamid Raza' : 'Clinic Reception Desk',
        role,
        designation: role === 'doctor' ? 'Consultant Child Specialist & Neonatologist' : 'Front Desk Officer',
      },
      token: 'session-' + Date.now(),
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials. Check doctor/receptionist username and password.' });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
