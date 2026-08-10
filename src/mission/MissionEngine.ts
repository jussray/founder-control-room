/**
 * src/mission/MissionEngine.ts
 * 
 * Core mission engine for Founder Control Room.
 * Manages mission lifecycle, state transitions, and operations.
 */

export enum MissionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface MissionConfig {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export interface Mission extends MissionConfig {
  id: string;
  status: MissionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class MissionEngine {
  private missions: Map<string, Mission> = new Map();
  private missionCounter: number = 0;

  /**
   * Creates a new mission.
   * @param config Mission configuration
   * @returns Created mission
   * @throws Error if title is empty
   */
  createMission(config: MissionConfig): Mission {
    if (!config.title || config.title.trim() === '') {
      throw new Error('Mission title is required');
    }

    const mission: Mission = {
      id: `mission_${++this.missionCounter}`,
      title: config.title,
      description: config.description,
      priority: config.priority,
      status: MissionStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.missions.set(mission.id, mission);
    return mission;
  }

  /**
   * Retrieves a mission by ID.
   * @param id Mission ID
   * @returns Mission or undefined if not found
   */
  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  /**
   * Lists all missions.
   * @returns Array of all missions
   */
  listMissions(): Mission[] {
    return Array.from(this.missions.values());
  }

  /**
   * Filters missions by criteria.
   * @param filter Filter criteria
   * @returns Filtered missions
   */
  filterMissions(filter: Partial<Mission>): Mission[] {
    return Array.from(this.missions.values()).filter((mission) => {
      if (filter.priority && mission.priority !== filter.priority) return false;
      if (filter.status && mission.status !== filter.status) return false;
      return true;
    });
  }

  /**
   * Starts a mission (transitions from PENDING to IN_PROGRESS).
   * @param id Mission ID
   * @throws Error if mission not found or invalid transition
   */
  startMission(id: string): void {
    const mission = this.getMission(id);
    if (!mission) throw new Error(`Mission ${id} not found`);
    if (mission.status !== MissionStatus.PENDING) {
      throw new Error('Invalid status transition');
    }

    mission.status = MissionStatus.IN_PROGRESS;
    mission.updatedAt = new Date();
  }

  /**
   * Completes a mission (transitions from IN_PROGRESS to COMPLETED).
   * @param id Mission ID
   * @throws Error if mission not found or invalid transition
   */
  completeMission(id: string): void {
    const mission = this.getMission(id);
    if (!mission) throw new Error(`Mission ${id} not found`);
    if (mission.status !== MissionStatus.IN_PROGRESS) {
      throw new Error('Invalid status transition');
    }

    mission.status = MissionStatus.COMPLETED;
    mission.updatedAt = new Date();
  }

  /**
   * Cancels a mission.
   * @param id Mission ID
   * @throws Error if mission not found
   */
  cancelMission(id: string): void {
    const mission = this.getMission(id);
    if (!mission) throw new Error(`Mission ${id} not found`);

    mission.status = MissionStatus.CANCELLED;
    mission.updatedAt = new Date();
  }
}