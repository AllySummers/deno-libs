import meow from 'npm:meow@13.2.0';
import { FixedThreadPool } from 'jsr:@poolifier/poolifier-web-worker@0.4.31';
import { pooledMap } from 'jsr:@std/async@1.0.10/pool';
import type {
    ExpandGlobsOptions,
    ExpandGlobsOutput,
    FindASTMatchesOptions,
    FindASTMatchesOutput,
} from './common.ts';

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
		-h, --help                               Show this help
	`,
    {
        importMeta: import.meta,
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
        pattern: patterns = [],
        before,
        after,
        context,
        concurrency,
        dir,
    } = args.flags;

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
    };
};

const { patterns, paths, exclude, context, concurrency, dir } = getCLIArgs(
    cli,
);

if (!patterns.length) {
    console.error('No pattern provided');
    Deno.exit(1);
}

const workerUrl = new URL('./worker.ts', import.meta.url);
workerUrl.protocol = 'file:';

const pool = new FixedThreadPool<
    FindASTMatchesOptions | ExpandGlobsOptions,
    FindASTMatchesOutput | ExpandGlobsOutput
>(
    concurrency,
    workerUrl,
    { errorEventHandler: console.error },
);

if (!pool.info.started) {
    pool.start();
}

try {
    for await (
        const globOutput of pooledMap(
            concurrency,
            paths,
            (path) =>
                pool.execute({
                    paths: [path],
                    exclude,
                    root: dir,
                }, 'expandGlobs'),
        )
    ) {
        if (!('files' in globOutput)) {
            continue;
        }

        const { files } = globOutput;

        for await (
            const matchesOutput of pooledMap(
                concurrency,
                files,
                (file) =>
                    pool.execute(
                        { file, patterns, context, root: dir },
                        'findASTMatches',
                    ),
            )
        ) {
            if (!('matches' in matchesOutput)) {
                continue;
            }

            for (const match of matchesOutput.matches) {
                console.log(match.content + `\n`);
            }
        }
    }
} catch (error) {
    console.error(error);
} finally {
    pool.destroy();
}
