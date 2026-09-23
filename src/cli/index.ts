#!/usr/bin/env node
import { Command } from 'commander';
import { DriverIdSchema } from '@contract';
import { NAMES } from '../core/names';
import { doctorCommand, registeredDriverIds } from './commands/doctor';
import { initCommand } from './commands/init';
import { ladderCommand } from './commands/ladder';
import { runCommand } from './commands/run';
import { shareCommand } from './commands/share';
import '../core/drivers/index';

const program = new Command()
  .name(NAMES.bin)
  .description('Race coding agents on your real issues. Merge the winner.')
  .version('0.1.0');

program
  .command('doctor')
  .description('Check git, gh, and agent CLIs')
  .option('-a, --agents <list>', 'comma-separated drivers; defaults to every registered driver')
  .action(async (o: { agents?: string }) => {
    const ids = o.agents
      ? o.agents.split(',').map((s) => DriverIdSchema.parse(s.trim()))
      : registeredDriverIds();
    process.exit((await doctorCommand(ids)) ? 0 : 1);
  });

program
  .command('run [issue]')
  .description('Race agents on an issue (owner/repo#123, #123, or URL)')
  .option('-a, --agents <list>', 'comma-separated agents, each "driver" or "driver:model"')
  .option('-b, --budget <usd>', 'per-agent budget in USD')
  .option('-t, --timeout <duration>', 'per-agent wall clock, e.g. 20m')
  .option('-w, --watch', 'open the live scoreboard in a browser')
  .option('--keep-worktrees', 'leave the agent worktrees on disk for inspection')
  .action(runCommand);

program
  .command('init')
  .description(`Write ${NAMES.configFile} and gitignore entries`)
  .action(() => initCommand());

program
  .command('share [id]')
  .description('Render a run\'s share card to a PNG (defaults to the latest run)')
  .action(shareCommand);

program
  .command('ladder')
  .description("Show this repository's agent ladder")
  .action(ladderCommand);

program.parseAsync(process.argv);
