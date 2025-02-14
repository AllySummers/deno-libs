import meow from 'npm:meow@13.2.0';
import { FixedThreadPool } from 'jsr:@poolifier/poolifier-web-worker@0.4.31';
import { pooledMap } from 'jsr:@std/async@1.0.10/pool';
import {
    EXTENSIONS,
    type FindASTMatchesOptions,
    type FindASTMatchesOutput,
} from './common.ts';
// @deno-types="npm:@types/esquery@1.5.4"
import esquery from 'npm:esquery@1.6.0';
import glob from 'npm:fast-glob@3.3.3';

const scriptName = 'oxc-grep';

const cli = meow(
    `
	OXC Grep

	Usage:
		${scriptName} [options] <pattern> [<paths>...]

	Options:
		-p <pattern>, --pattern <pattern>        Additional pattern to match
		-e <path>, --exclude <path>              Exclude path from search
		-B <number>, --before <number>           Number of lines to show before match
		-A <number>, --after <number>            Number of lines to show after match
		-C <number>, --context <number>          Number of lines to show before and after match
		-c <number>, --concurrency <number>      Number of cores to use for parallel processing
		-d <path>, --dir <path>                  Directory to search in (default: cwd)
		-N, --no-line-number                     Do not show line numbers
		-I, --no-filename                        Do not show filenames
		--noColor                                Do not colorize output
		-h, --help                               Show this help
	`,
    {
        // the URL is overriden because if this is installed from a URL, meow will error that it must be a `file:` URL
        importMeta: { ...import.meta, url: `file:///oxc-grep/mod.ts` },
        argv: Deno.args,
        pkg: {
            name: scriptName,
            version: '0.0.1',
        },
        flags: {
            pattern: {
                type: 'string',
                shortFlag: 'p',
                isMultiple: true,
            },
            exclude: {
                type: 'string',
                shortFlag: 'e',
                isMultiple: true,
            },
            before: {
                type: 'number',
                shortFlag: 'B',
            },
            after: {
                type: 'number',
                shortFlag: 'A',
            },
            context: {
                type: 'number',
                shortFlag: 'C',
            },
            noLineNumber: {
                type: 'boolean',
                shortFlag: 'N',
                default: false,
            },
            noFilename: {
                type: 'boolean',
                shortFlag: 'I',
                default: false,
            },
            noColor: {
                type: 'boolean',
                default: false,
            },
            concurrency: {
                type: 'number',
                shortFlag: 'c',
                default: navigator.hardwareConcurrency,
            },
            dir: {
                type: 'string',
                shortFlag: 'd',
                default: Deno.cwd(),
            },
        },
    },
);

const getCLIArgs = (args: typeof cli) => {
    const [pattern, ...paths] = args.input;
    const {
        exclude = [],
        pattern: patterns = ['**/node_modules'],
        before,
        after,
        context,
        concurrency,
        dir,
        noFilename,
        noLineNumber,
        noColor,
    } = args.flags;

    if (!pattern) {
        console.error('No pattern provided');
        Deno.exit(1);
    }

    return {
        patterns: [pattern, ...patterns],
        paths: paths.length ? paths : ['./'],
        exclude,
        context: {
            before: Math.max(before ?? 0, context ?? 0),
            after: Math.max(after ?? 0, context ?? 0),
        },
        concurrency,
        dir,
        printFilenames: !noFilename,
        printLineNumbers: !noLineNumber,
        noColor,
    };
};

const {
    patterns,
    paths,
    exclude,
    context,
    concurrency,
    dir,
    printFilenames,
    printLineNumbers,
    noColor,
} = getCLIArgs(
    cli,
);

const parsedPatterns = patterns.flatMap<esquery.Selector>((pattern) => {
    try {
        return esquery.parse(pattern);
    } catch {
        console.error(`Invalid pattern: ${pattern}`);
    }

    return [];
});

if (parsedPatterns.length !== patterns.length) {
    Deno.exit(1);
}

const globPaths = await Promise.all(paths.map(async (path) => {
    try {
        const { isDirectory } = await Deno
            .stat(path);

        if (isDirectory) {
            return `${path}/**/*.{${EXTENSIONS.join(',')}}`;
        }
    } catch {
        // ignored
    }

    return path;
}));

const files = await glob(globPaths, {
    ignore: exclude,
    concurrency: concurrency,
});

if (!files.length) {
    console.error('No files found');
    Deno.exit(1);
}

const maxConcurrency = Math.min(concurrency, files.length);

const workerUrl = new URL('./worker.ts', import.meta.url);
workerUrl.protocol = 'file:';

const pool = new FixedThreadPool<
    FindASTMatchesOptions,
    FindASTMatchesOutput
>(
    maxConcurrency,
    workerUrl,
    { errorEventHandler: console.error },
);

if (!pool.info.started) {
    pool.start();
}

try {
    for await (
        const matchesOutput of pooledMap(
            concurrency,
            files,
            (file) =>
                pool.execute(
                    {
                        file,
                        patterns: parsedPatterns,
                        options: {
                            beforeContext: context.before,
                            afterContext: context.after,
                            printFilenames,
                            printLineNumbers,
                            color: !noColor,
                        },
                        root: dir,
                    },
                    'findASTMatches',
                ),
        )
    ) {
        if (
            !matchesOutput || !('result' in matchesOutput) ||
            !matchesOutput.result
        ) {
            continue;
        }

        console.log(matchesOutput.result);
    }
} catch (error) {
    console.error(error);
} finally {
    pool.destroy();
}
