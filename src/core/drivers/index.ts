import { claudeDriver } from './claude';
import { codexDriver } from './codex';
import { cursorDriver } from './cursor';
import { geminiDriver } from './gemini';
import { registerDriver } from './registry';

registerDriver(claudeDriver);
registerDriver(codexDriver);
registerDriver(geminiDriver);
registerDriver(cursorDriver);
