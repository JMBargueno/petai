import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GameDataService implements OnModuleInit {
  private balanceData: any;
  private speciesData: any[];
  private patternsData: any[];
  private foodsData: any[];
  private skillsData: any[];
  private missionsData: any;

  onModuleInit() {
    this.loadData();
  }

  private loadData() {
    const candidates = [
      path.resolve(process.cwd(), 'shared/game-data'),
      path.resolve(process.cwd(), '../shared/game-data'),
      path.resolve(__dirname, '../../../../shared/game-data'),
      path.resolve(__dirname, '../../../shared/game-data'),
    ];

    const dataDir = candidates.find((dir) => fs.existsSync(dir)) || candidates[0];

    this.balanceData = JSON.parse(fs.readFileSync(path.join(dataDir, 'balance.json'), 'utf8'));
    this.speciesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'species.json'), 'utf8'));
    this.patternsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'patterns.json'), 'utf8'));
    this.foodsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'foods.json'), 'utf8'));
    this.skillsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'skills.json'), 'utf8'));
    const missionsPath = path.join(dataDir, 'missions.json');
    this.missionsData = fs.existsSync(missionsPath)
      ? JSON.parse(fs.readFileSync(missionsPath, 'utf8'))
      : null;
  }

  getBalance() {
    return this.balanceData;
  }

  getSpecies() {
    return this.speciesData;
  }

  getPatterns() {
    return this.patternsData;
  }

  getFoods() {
    return this.foodsData;
  }

  getSkills() {
    return this.skillsData;
  }

  getMissions() {
    return this.missionsData;
  }

  getCatalog() {
    return {
      balance: this.balanceData,
      species: this.speciesData,
      patterns: this.patternsData,
      foods: this.foodsData,
      skills: this.skillsData,
    };
  }
}
