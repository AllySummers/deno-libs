import { expect } from '@std/expect';
import { bold, brightRed } from '@std/fmt';
import {
    extractLinesAndContext,
    getLineForIndex,
    getLineIndices,
    highlightMatchedRanges,
    mergeRanges,
    sortRanges,
} from './grep-print.ts';
import type {
    ExtractedLinesAndContext,
    LineIndex,
    TextRange,
} from './common.ts';

Deno.test('highlightMatchedRanges', async ({ step }) => {
    await step('returns content unchanged when no ranges are given', () => {
        const content = 'hello, world!';
        const result = highlightMatchedRanges(content, [], {
            color: false,
        });
        expect(result).toStrictEqual(content);
    });

    await step('highlights single range', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5]];
        const result = highlightMatchedRanges(content, ranges, {
            color: true,
        });
        expect(result).toStrictEqual(
            `${bold(brightRed('hello'))}, world!`,
        );
    });

    await step('does not colour output when color is false', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5]];
        const result = highlightMatchedRanges(content, ranges, {
            color: false,
        });
        expect(result).toStrictEqual(
            `hello, world!`,
        );
    });

    await step('highlights multiple non-overlapping ranges', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5], [7, 12]];
        const result = highlightMatchedRanges(content, ranges, {
            color: true,
        });
        expect(result).toStrictEqual(
            `${bold(brightRed('hello'))}, ${bold(brightRed('world'))}!`,
        );
    });

    await step('highlights overlapping ranges', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5], [7, 12]];
        const result = highlightMatchedRanges(content, ranges, {
            color: true,
        });
        expect(result).toStrictEqual(
            `${bold(brightRed('hello'))}, ${bold(brightRed('world'))}!`,
        );
    });

    await step('handles ranges at the end of content', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[7, 13]];
        const result = highlightMatchedRanges(content, ranges, {
            color: true,
        });
        expect(result).toStrictEqual(
            `hello, ${bold(brightRed('world!'))}`,
        );
    });

    await step('handles multiple overlapping ranges with gaps', () => {
        const content = 'testing multiple ranges here';
        const ranges: TextRange[] = [[0, 7], [4, 16], [24, 28]];
        const result = highlightMatchedRanges(content, ranges, {
            color: true,
        });
        expect(result).toStrictEqual(
            `${bold(brightRed('testing multiple'))} ranges ${
                bold(brightRed('here'))
            }`,
        );
    });

    await step('handles empty content', () => {
        const content = '';
        const ranges: TextRange[] = [[0, 0]];
        const result = highlightMatchedRanges(content, ranges, {
            color: true,
        });
        expect(result).toStrictEqual('');
    });

    await step('handles ranges that cover entire content', () => {
        const content = 'test';
        const ranges: TextRange[] = [[0, 4]];
        const result = highlightMatchedRanges(content, ranges, {
            color: true,
        });
        expect(result).toStrictEqual(bold(brightRed('test')));
    });
});

Deno.test('sortRanges', async ({ step }) => {
    await step('returns empty array when given empty input', () => {
        const result = sortRanges([]);
        expect(result).toStrictEqual([]);
    });

    await step('returns same range when given single range', () => {
        const result = sortRanges([[0, 3]]);
        expect(result).toStrictEqual([[0, 3]]);
    });

    await step('sorts two ranges by start position', () => {
        const result = sortRanges([
            [5, 6],
            [0, 3],
        ]);
        expect(result).toStrictEqual([
            [0, 3],
            [5, 6],
        ]);
    });

    await step('sorts ranges with same start by end position', () => {
        const result = sortRanges([
            [5, 8],
            [5, 6],
            [5, 7],
        ]);
        expect(result).toStrictEqual([
            [5, 6],
            [5, 7],
            [5, 8],
        ]);
    });

    await step('sorts mixed ranges correctly', () => {
        const result = sortRanges([
            [5, 8],
            [1, 3],
            [5, 6],
            [2, 4],
            [5, 7],
        ]);
        expect(result).toStrictEqual([
            [1, 3],
            [2, 4],
            [5, 6],
            [5, 7],
            [5, 8],
        ]);
    });

    await step('handles overlapping ranges', () => {
        const result = sortRanges([
            [5, 10],
            [1, 6],
            [3, 8],
        ]);
        expect(result).toStrictEqual([
            [1, 6],
            [3, 8],
            [5, 10],
        ]);
    });
});

Deno.test('mergeRanges', async ({ step }) => {
    await step('returns empty array when given empty input', () => {
        const result = mergeRanges([]);
        expect(result).toStrictEqual([]);
    });

    await step('returns same range when given single range', () => {
        const result = mergeRanges([[0, 3]]);
        expect(result).toStrictEqual([[0, 3]]);
    });

    await step('merges two ranges', () => {
        const result = mergeRanges([
            [0, 3],
            [3, 6],
        ]);
        expect(result).toStrictEqual([[0, 6]]);
    });

    await step('merges three ranges', () => {
        const result = mergeRanges([
            [0, 3],
            [3, 6],
            [6, 9],
        ]);
        expect(result).toStrictEqual([[0, 9]]);
    });

    await step('merges overlapping ranges', () => {
        const result = mergeRanges([
            [0, 3],
            [2, 6],
            [5, 9],
        ]);
        expect(result).toStrictEqual([[0, 9]]);
    });

    await step('merges multiple overlapping ranges', () => {
        const result = mergeRanges([
            [0, 3],
            [2, 6],
            [5, 9],
            [10, 15],
            [13, 17],
        ]);
        expect(result).toStrictEqual([[0, 9], [10, 17]]);
    });

    await step('merges multiple overlapping ranges with gaps', () => {
        const result = mergeRanges([
            [0, 3],
            [5, 9],
            [10, 15],
            [13, 17],
        ]);
        expect(result).toStrictEqual([[0, 3], [5, 9], [10, 17]]);
    });

    await step(
        'merges a complex set of ranges with multiple gaps and overlaps',
        () => {
            const result = mergeRanges([
                [0, 3],
                [5, 9],
                [10, 15],
                [13, 17],
                [20, 25],
                [22, 27],
                [30, 35],
                [33, 37],
            ]);
            expect(result).toStrictEqual([[0, 3], [5, 9], [10, 17], [20, 27], [
                30,
                37,
            ]]);
        },
    );
});

Deno.test('getLineIndices', async ({ step }) => {
    await step('returns single line for empty content', () => {
        const result = getLineIndices('');
        expect(result).toStrictEqual([{ index: 0, lineNo: 1 }]);
    });

    await step('returns single line for single line content', () => {
        const result = getLineIndices('hello, world!');
        expect(result).toStrictEqual([{ index: 0, lineNo: 1 }]);
    });

    await step('returns line indices for multi-line content', () => {
        const content = [
            'line1',
            'line2',
            'line3',
        ].join('\n');
        const result = getLineIndices(content);
        expect(result).toStrictEqual([
            { index: 0, lineNo: 1 },
            { index: 6, lineNo: 2 },
            { index: 12, lineNo: 3 },
        ]);
    });

    await step('handles content with consecutive newlines', () => {
        const content = [
            'line1',
            '',
            'line3',
        ].join('\n');
        const result = getLineIndices(content);

        const [
            expected1,
            expected2,
            expected3,
        ]: LineIndex[] = [
            { index: 0, lineNo: 1 },
            { index: 6, lineNo: 2 },
            { index: 7, lineNo: 3 },
        ];

        expect(result).toHaveLength(3);
        expect(result[0]).toStrictEqual(expected1);
        expect(result[1]).toStrictEqual(expected2);
        expect(result[2]).toStrictEqual(expected3);
    });

    await step('handles different newline characters', () => {
        const content = 'line1\r\nline2\nline3';
        const result = getLineIndices(content);
        const [
            expected1,
            expected2,
            expected3,
        ]: LineIndex[] = [
            { index: 0, lineNo: 1 },
            { index: 7, lineNo: 2 },
            { index: 13, lineNo: 3 },
        ];

        expect(result).toHaveLength(3);
        expect(result[0]).toStrictEqual(expected1);
        expect(result[1]).toStrictEqual(expected2);
        expect(result[2]).toStrictEqual(expected3);
    });
});

Deno.test('extractLinesAndContext', async ({ step }) => {
    await step('returns empty array when no ranges are given', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([]);
    });

    await step('works with printExact and multiple ranges', () => {
        const content = 'testing multiple ranges here';
        const ranges: TextRange[] = [[0, 7], [4, 16], [24, 28]];
        const result = extractLinesAndContext(content, ranges, {
            color: false,
            beforeContext: 0,
            afterContext: 0,
            printExact: true,
        });

        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [[1, 'testing']],
                afterContext: [],
            },
            {
                afterContext: [],
                beforeContext: [],
                matchedLines: [
                    [
                        1,
                        'ing multiple',
                    ],
                ],
            },
            {
                afterContext: [],
                beforeContext: [],
                matchedLines: [
                    [
                        1,
                        'here',
                    ],
                ],
            },
        ]);
    });

    await step('works with printExact and multiple ranges and color', () => {
        const content = 'testing multiple ranges here';
        const ranges: TextRange[] = [[0, 7], [4, 16], [24, 28]];
        const result = extractLinesAndContext(content, ranges, {
            color: true,
            beforeContext: 0,
            afterContext: 0,
            printExact: true,
        });

        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [[1, bold(brightRed('testing'))]],
                afterContext: [],
            },
            {
                afterContext: [],
                beforeContext: [],
                matchedLines: [
                    [
                        1,
                        bold(brightRed('ing multiple')),
                    ],
                ],
            },
            {
                afterContext: [],
                beforeContext: [],
                matchedLines: [
                    [
                        1,
                        bold(brightRed('here')),
                    ],
                ],
            },
        ]);
    });

    await step('extracts single line with no context', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5]];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [[1, 'hello, world!']],
                afterContext: [],
            },
        ]);
    });

    await step('works with printExact and no color', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5]];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: false,
            printExact: true,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [[1, 'hello']],
                afterContext: [],
            },
        ]);
    });

    await step('works with printExact and color enabled', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5]];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: true,
            printExact: true,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [[1, bold(brightRed('hello'))]],
                afterContext: [],
            },
        ]);
    });

    await step('extracts single line with before context', () => {
        const content = 'hello\nworld';
        const ranges: TextRange[] = [[6, 11]];
        const options = {
            beforeContext: 1,
            afterContext: 0,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [[1, 'hello']],
                matchedLines: [[2, 'world']],
                afterContext: [],
            },
        ]);
    });

    await step('extracts single line with after context', () => {
        const content = 'hello\nworld';
        const ranges: TextRange[] = [[0, 5]];
        const options = {
            beforeContext: 0,
            afterContext: 1,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [[1, 'hello']],
                afterContext: [[2, 'world']],
            },
        ]);
    });

    await step('extracts with ranges that span multiple lines', () => {
        const content = 'line1\nline2\nline3\nline4';
        const ranges: TextRange[] = [[0, 11]];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [
                    [1, 'line1'],
                    [2, 'line2'],
                ],
                afterContext: [],
            },
        ]);
    });

    await step('handles overlapping ranges correctly', () => {
        const content = [
            'line1',
            'line2',
            'line3',
            'line4',
            'line5',
        ].join('\n');
        const ranges: TextRange[] = [[0, 8], [5, 17]];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [
                    [1, 'line1'],
                    [2, 'line2'],
                    [3, 'line3'],
                ],
                afterContext: [],
            },
        ]);
    });

    await step(
        'extracts with before and after context at the beginning and end of the content',
        () => {
            const content = [
                `import { foo, bar } from 'module';`,
                `import { baz } from 'module2';`,
                `import { qux } from 'module3';`,
                '',
                'function test() {',
                '    console.log("hello, world!");',
                '}',
                '',
                'export const test2 = () => {',
                '    console.log("hello, world 2!");',
                '};',
                '',
                'export function test3() {',
                '    console.log("hello, world 3!");',
                '}',
                'export default test;',
            ].join('\n');
            const ranges: TextRange[] = [
                [9, 17], // 'foo, bar'
                [107, 113], // 'test()'
                [286, 306], // 'export default test;'
            ];
            const options = {
                beforeContext: 1,
                afterContext: 1,
                color: false,
                printExact: false,
            };
            const result = extractLinesAndContext(content, ranges, options);
            const [expected1, expected2, expected3]:
                ExtractedLinesAndContext[] = [
                    {
                        beforeContext: [],
                        matchedLines: [
                            [1, `import { foo, bar } from 'module';`],
                        ],
                        afterContext: [
                            [2, `import { baz } from 'module2';`],
                        ],
                    },
                    {
                        beforeContext: [
                            [4, ''],
                        ],
                        matchedLines: [
                            [5, 'function test() {'],
                        ],
                        afterContext: [
                            [6, '    console.log("hello, world!");'],
                        ],
                    },
                    {
                        beforeContext: [
                            [15, '}'],
                        ],
                        matchedLines: [
                            [16, 'export default test;'],
                        ],
                        afterContext: [],
                    },
                ];

            expect(result).toHaveLength(3);
            expect(result[0]).toStrictEqual(expected1);
            expect(result[1]).toStrictEqual(expected2);
            expect(result[2]).toStrictEqual(expected3);
        },
    );

    await step('handles CRLF line endings', () => {
        const content = 'line1\r\nline2\r\nline3';
        const ranges: TextRange[] = [[0, 5], [7, 12]];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [[1, 'line1']],
                afterContext: [],
            },
            {
                beforeContext: [],
                matchedLines: [[2, 'line2']],
                afterContext: [],
            },
        ]);
    });

    await step('extracts multiple lines with context', () => {
        const content = [
            'line1',
            'line2',
            'line3',
            'line4',
        ].join('\n');
        const ranges: TextRange[] = [[0, 17]];
        const options = {
            beforeContext: 1,
            afterContext: 1,
            color: false,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result).toStrictEqual([
            {
                beforeContext: [],
                matchedLines: [
                    [1, 'line1'],
                    [2, 'line2'],
                    [3, 'line3'],
                ],
                afterContext: [
                    [4, 'line4'],
                ],
            },
        ]);
    });

    await step('handles color option correctly', () => {
        const content = 'hello, world!';
        const ranges: TextRange[] = [[0, 5]];
        const options = {
            beforeContext: 0,
            afterContext: 0,
            color: true,
            printExact: false,
        };
        const result = extractLinesAndContext(content, ranges, options);
        expect(result[0].matchedLines).toStrictEqual([[
            1,
            `${bold(brightRed('hello'))}, world!`,
        ]]);
    });
});

Deno.test('getLineForIndex', async ({ step }) => {
    await step('returns undefined for empty content', () => {
        const result = getLineForIndex([], 0);
        expect(result).toBeUndefined();
    });

    await step('returns correct line number for given index', () => {
        const lineIndices = [
            { index: 0, lineNo: 1 },
            { index: 5, lineNo: 2 },
            { index: 10, lineNo: 3 },
        ];
        const result = getLineForIndex(lineIndices, 3);
        expect(result).toBe(1);
    });

    await step('returns correct line number for index at line start', () => {
        const lineIndices = [
            { index: 0, lineNo: 1 },
            { index: 5, lineNo: 2 },
            { index: 10, lineNo: 3 },
        ];
        const result = getLineForIndex(lineIndices, 5);
        expect(result).toBe(2);
    });

    await step('handles single line content correctly', () => {
        const lineIndices = [{ index: 0, lineNo: 1 }];
        const result = getLineForIndex(lineIndices, 0);
        expect(result).toBe(1);
    });
});
