import { EnhancedDaemonService } from './enhanced-daemon.js';
import chalk from 'chalk';

// Start the enhanced daemon
const daemon = new EnhancedDaemonService();

daemon.start().catch(err => {
  console.error(chalk.red('💥 Fatal error:'), err.message);
  console.error(err.stack);
  process.exit(1);
});