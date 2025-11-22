import { Router } from 'express';
import { db } from '../db';
import { incidents, incidentLogs, solutions, timelineEvents, commits } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/incidents
 * Get all incidents
 */
router.get('/', async (_req, res) => {
  try {
    const allIncidents = await db
      .select()
      .from(incidents)
      .orderBy(desc(incidents.createdAt));

    return res.json({ data: allIncidents });
  } catch (error) {
    logger.error('Error fetching incidents:', error);
    return res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

/**
 * GET /api/incidents/:id
 * Get a specific incident with all related data
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch incident
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id));

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Fetch related data
    const [logs, timeline, solutionsList, commitsList] = await Promise.all([
      db.select().from(incidentLogs).where(eq(incidentLogs.incidentId, id)).orderBy(desc(incidentLogs.timestamp)),
      db.select().from(timelineEvents).where(eq(timelineEvents.incidentId, id)).orderBy(desc(timelineEvents.timestamp)),
      db.select().from(solutions).where(eq(solutions.incidentId, id)).orderBy(desc(solutions.createdAt)),
      db.select().from(commits).where(eq(commits.incidentId, id)).orderBy(desc(commits.timestamp)),
    ]);

    return res.json({
      data: {
        incident,
        logs,
        timeline,
        solutions: solutionsList,
        commits: commitsList,
      },
    });
  } catch (error) {
    logger.error('Error fetching incident:', error);
    return res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

/**
 * POST /api/incidents
 * Create a new incident
 */
router.post('/', async (req, res) => {
  try {
    const { title, description, severity, affectedServices, userId } = req.body;

    const [newIncident] = await db
      .insert(incidents)
      .values({
        userId: userId || 'demo-user',
        title,
        description,
        severity: severity || 'medium',
        affectedServices: affectedServices || [],
        status: 'detecting',
      })
      .returning();

    logger.info(`New incident created: ${newIncident.id}`);
    return res.status(201).json({ data: newIncident });
  } catch (error) {
    logger.error('Error creating incident:', error);
    return res.status(500).json({ error: 'Failed to create incident' });
  }
});

/**
 * PATCH /api/incidents/:id
 * Update an incident
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updatedIncident] = await db
      .update(incidents)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, id))
      .returning();

    if (!updatedIncident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    logger.info(`Incident updated: ${id}`);
    return res.json({ data: updatedIncident });
  } catch (error) {
    logger.error('Error updating incident:', error);
    return res.status(500).json({ error: 'Failed to update incident' });
  }
});

/**
 * POST /api/incidents/:id/logs
 * Add logs to an incident
 */
router.post('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { logs: logsData } = req.body;

    if (!Array.isArray(logsData)) {
      return res.status(400).json({ error: 'Logs must be an array' });
    }

    const newLogs = await db
      .insert(incidentLogs)
      .values(
        logsData.map((log) => ({
          incidentId: id,
          ...log,
        }))
      )
      .returning();

    return res.status(201).json({ data: newLogs });
  } catch (error) {
    logger.error('Error adding logs:', error);
    return res.status(500).json({ error: 'Failed to add logs' });
  }
});

/**
 * POST /api/incidents/:id/timeline
 * Add timeline event to an incident
 */
router.post('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, description, metadata } = req.body;

    const [newEvent] = await db
      .insert(timelineEvents)
      .values({
        incidentId: id,
        type,
        title,
        description,
        metadata,
      })
      .returning();

    return res.status(201).json({ data: newEvent });
  } catch (error) {
    logger.error('Error adding timeline event:', error);
    return res.status(500).json({ error: 'Failed to add timeline event' });
  }
});

export default router;

