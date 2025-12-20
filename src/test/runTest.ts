/**
 * @fileoverview Run Test (tests).
 *
 * - Test coverage for CBOR Viewer behaviors.
 * - Prefer intent-revealing fixtures and assertions over duplicating implementation details.
 * - Keep failures actionable: assert on user-visible output shapes when possible.
 */
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
