/**
 * src/__tests__/mission/missionEngine.test.ts
 * 
 * Test-driven development for mission engine.
 * Tests mission creation, execution, and state management.
 */

import { MissionEngine, Mission, MissionStatus } from '../../mission/MissionEngine';

describe('Mission Engine', () => {
  let engine: MissionEngine;

  beforeEach(() => {
    engine = new MissionEngine();
  });

  describe('Mission Creation', () => {
    it('should create a new mission with valid parameters', () => {
      const mission = engine.createMission({
        title: 'Deploy TDD infrastructure',
        description: 'Introduce testing to three repositories',
        priority: 'high',
      });

      expect(mission).toBeDefined();
      expect(mission.title).toBe('Deploy TDD infrastructure');
      expect(mission.status).toBe(MissionStatus.PENDING);
    });

    it('should reject missions without a title', () => {
      expect(() => {
        engine.createMission({
          title: '',
          description: 'Invalid mission',
          priority: 'low',
        });
      }).toThrow('Mission title is required');
    });

    it('should assign unique IDs to missions', () => {
      const mission1 = engine.createMission({
        title: 'First mission',
        description: 'First',
        priority: 'high',
      });

      const mission2 = engine.createMission({
        title: 'Second mission',
        description: 'Second',
        priority: 'low',
      });

      expect(mission1.id).not.toBe(mission2.id);
    });
  });

  describe('Mission Status Management', () => {
    it('should transition mission from PENDING to IN_PROGRESS', () => {
      const mission = engine.createMission({
        title: 'Test mission',
        description: 'Testing status transitions',
        priority: 'medium',
      });

      engine.startMission(mission.id);
      const updated = engine.getMission(mission.id);

      expect(updated.status).toBe(MissionStatus.IN_PROGRESS);
    });

    it('should transition mission from IN_PROGRESS to COMPLETED', () => {
      const mission = engine.createMission({
        title: 'Test mission',
        description: 'Complete this',
        priority: 'high',
      });

      engine.startMission(mission.id);
      engine.completeMission(mission.id);
      const updated = engine.getMission(mission.id);

      expect(updated.status).toBe(MissionStatus.COMPLETED);
    });

    it('should prevent invalid status transitions', () => {
      const mission = engine.createMission({
        title: 'Test mission',
        description: 'Cannot skip states',
        priority: 'low',
      });

      expect(() => {
        engine.completeMission(mission.id); // Cannot complete pending mission
      }).toThrow('Invalid status transition');
    });
  });

  describe('Mission Retrieval', () => {
    it('should retrieve mission by ID', () => {
      const created = engine.createMission({
        title: 'Retrieve test',
        description: 'Test retrieval',
        priority: 'medium',
      });

      const retrieved = engine.getMission(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.title).toBe('Retrieve test');
    });

    it('should return undefined for non-existent mission', () => {
      const mission = engine.getMission('non-existent-id');
      expect(mission).toBeUndefined();
    });

    it('should list all missions', () => {
      engine.createMission({
        title: 'Mission 1',
        description: 'First',
        priority: 'high',
      });
      engine.createMission({
        title: 'Mission 2',
        description: 'Second',
        priority: 'low',
      });

      const missions = engine.listMissions();

      expect(missions).toHaveLength(2);
    });
  });

  describe('Mission Filtering', () => {
    beforeEach(() => {
      engine.createMission({
        title: 'High priority task',
        description: 'Urgent',
        priority: 'high',
      });
      engine.createMission({
        title: 'Low priority task',
        description: 'Not urgent',
        priority: 'low',
      });
    });

    it('should filter missions by priority', () => {
      const highPriority = engine.filterMissions({ priority: 'high' });
      expect(highPriority).toHaveLength(1);
      expect(highPriority[0].priority).toBe('high');
    });

    it('should filter missions by status', () => {
      const pending = engine.filterMissions({ status: MissionStatus.PENDING });
      expect(pending.length).toBeGreaterThan(0);
    });
  });
});