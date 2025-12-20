/**
 * @fileoverview Index (tests).
 *
 * - Test coverage for CBOR Viewer behaviors.
 * - Prefer intent-revealing fixtures and assertions over duplicating implementation details.
 * - Keep failures actionable: assert on user-visible output shapes when possible.
 */
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
    });

    const testsRoot = path.resolve(__dirname, '.');

    const files = await glob('**/*.test.js', { cwd: testsRoot });

    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise((resolve, reject) => {
        try {
            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}
