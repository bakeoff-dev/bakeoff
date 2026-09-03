#!/usr/bin/env bun
import { Command } from 'commander';
import { DriverIdSchema } from '@contract';
import { NAMES } from '../core/names';
import { doctorCommand } from './commands/doctor';
import '../core/drivers/index';

const program = new Command()
  .name(NAMES.bin)
  .description('Race coding agents on your real issues. Merge the winner.')
  .version('0.1.0');

program
  .command('doctor')
  .description('Check git, gh, and agent CLIs')
  .option('-a, --agents <list>', 'comma-separated drivers', 'claude,codex,opencode')
  .action(async (o: { agents: string }) => {
    const ids = o.agents.split(',').map((s) => DriverIdSchema.parse(s.trim()));
    process.exit((await doctorCommand(ids)) ? 0 : 1);
  });

program.parseAsync(process.argv);
