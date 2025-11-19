import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { Proposal } from '../types/proposal';

class DatabaseService {
  private db: Database.Database | null = null;

  initialize() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'pool-proposals.db');
    const isNewDatabase = !fs.existsSync(dbPath);

    console.log('Database path:', dbPath);

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Read and execute schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema statements
    this.db.exec(schema);

    // Load sample data if this is a new database
    if (isNewDatabase) {
      try {
        const sampleDataPath = path.join(__dirname, '../database/sampleData.sql');
        const sampleData = fs.readFileSync(sampleDataPath, 'utf-8');
        this.db.exec(sampleData);
        console.log('Sample data loaded successfully');
      } catch (error) {
        console.warn('Failed to load sample data:', error);
      }
    }

    console.log('Database initialized successfully');
  }

  // Proposal methods
  saveProposal(proposal: Proposal): number {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO proposals
      (proposal_number, created_date, last_modified, status, data, subtotal, tax_rate, tax_amount, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      proposal.proposalNumber,
      proposal.createdDate,
      proposal.lastModified,
      proposal.status,
      JSON.stringify(proposal),
      proposal.subtotal,
      proposal.taxRate,
      proposal.taxAmount,
      proposal.totalCost
    );

    return result.lastInsertRowid as number;
  }

  getProposal(proposalNumber: string): Proposal | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT data FROM proposals WHERE proposal_number = ?');
    const row = stmt.get(proposalNumber) as { data: string } | undefined;

    if (!row) return null;

    return JSON.parse(row.data) as Proposal;
  }

  getAllProposals(): Proposal[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT data FROM proposals ORDER BY last_modified DESC');
    const rows = stmt.all() as { data: string }[];

    return rows.map(row => JSON.parse(row.data) as Proposal);
  }

  deleteProposal(proposalNumber: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM proposals WHERE proposal_number = ?');
    stmt.run(proposalNumber);
  }

  // Reference data methods
  getPoolModels() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM pool_models').all();
  }

  getExcavationRates() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM excavation_rates').all();
  }

  getPlumbingRates() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM plumbing_rates').all();
  }

  getTileRates() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM tile_rates').all();
  }

  getCopingRates() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM coping_rates').all();
  }

  getDeckingRates() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM decking_rates').all();
  }

  getEquipmentCatalog() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM equipment_catalog').all();
  }

  getWaterFeaturesCatalog() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM water_features_catalog').all();
  }

  getFinishRates() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM finish_rates').all();
  }

  getDrainageRates() {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM drainage_rates').all();
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const dbService = new DatabaseService();
