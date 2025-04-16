import { bold, brightRed, green, magenta } from '@std/fmt';
import type {
    ExtractedLinesAndContext,
    LineContent,
    LineIndex,
    OXCGrepOptions,
    TextRange,
} from './common.ts';

export const sortRanges = (ranges: TextRange[]): TextRange[] =>
    ranges.toSorted(([aStart, aEnd], [bStart, bEnd]) =>
        aStart - bStart || aEnd - bEnd
    );

export const mergeRanges = (ranges: TextRange[]): TextRange[] =>
    sortRanges(ranges).reduce<TextRange[]>((acc, [start, end]) => {
        const last = acc.at(-1);
        if (last && last[1] >= start) {
            last[1] = Math.max(last[1], end);
        } else {
            acc.push([start, end]);
        }
        return acc;
    }, []);

export const getLineIndices = (
    content: string,
): Array<LineIndex> =>
    [
        { index: 0, lineNo: 1 },
    ].concat(
        ...(
            content.includes('\n')
                ? Array.from<RegExpExecArray, LineIndex>(
                    content.matchAll(/\r?\n/g),
                    (match, lineIndex) => ({
                        index: match.index + (match[0].length),
                        lineNo: lineIndex + 2,
                    }),
                )
                : []
        ),
    );

export const getLineForIndex = (
    lineIndices: Array<LineIndex>,
    index: number,
): number | undefined =>
    lineIndices.find(({ index: lineIndex }, i, arr) => {
        const nextLineIndex = arr[i + 1]?.index ?? Infinity;
        return index >= lineIndex && index < nextLineIndex;
    })?.lineNo;

const colorNonWhitespace = (
    _: string,
    leading: string,
    content: string,
    trailing: string,
) => leading + bold(brightRed(content)) + trailing;

const excludeWhitespaceRegex = /^(\s*)(.*?)(\s*)$/;

export const highlightMatchedRanges = (
    content: string,
    ranges: TextRange[],
    { color }: Pick<
        OXCGrepOptions,
        'color'
    >,
): string =>
    ranges.length === 0 || !content
        ? content
        : mergeRanges(ranges).reduceRight((acc, [start, end]) => {
            const before = acc.slice(0, start);
            const after = acc.slice(end);

            const selectedText = acc.slice(start, end);
            const highlighted = color
                ? selectedText.replace(
                    excludeWhitespaceRegex,
                    colorNonWhitespace,
                )
                : selectedText;

            return before + highlighted + after;
        }, content);

export const extractLinesAndContext = (
    content: string,
    ranges: TextRange[],
    { beforeContext, afterContext, color, printExact }: Pick<
        OXCGrepOptions,
        'beforeContext' | 'afterContext' | 'color' | 'printExact'
    >,
): ExtractedLinesAndContext[] => {
    if (ranges.length === 0) return [];

    // When printExact is false, we can merge ranges as we'll be showing full lines
    // When printExact is true, we need to keep individual ranges to show exact matches
    const rangeList = printExact ? sortRanges(ranges) : mergeRanges(ranges);
    const processedContent = color && !printExact
        ? highlightMatchedRanges(content, rangeList, { color })
        : content;

    const splitContent = processedContent.split(/\r?\n/);

    return rangeList.map((range) => {
        const lineIndices = getLineIndices(content);
        const startLine = getLineForIndex(lineIndices, range[0]) ?? 1;
        const endLine = getLineForIndex(lineIndices, range[1]) ??
            lineIndices.at(-1)?.lineNo ?? 1;

        const beforeLines = Math.max(0, startLine - beforeContext);
        const afterLines = Math.min(
            splitContent.length,
            endLine + afterContext,
        );

        if (printExact) {
            const matchedText = color
                ? highlightMatchedRanges(content.slice(range[0], range[1]), [[
                    0,
                    range[1] - range[0],
                ]], { color })
                : content.slice(range[0], range[1]);

            return {
                beforeContext: splitContent
                    .slice(beforeLines - 1, startLine - 1)
                    .map<LineContent>((
                        content,
                        i,
                    ) => [beforeLines + i, content]),
                matchedLines: [[startLine, matchedText]],
                afterContext: splitContent
                    .slice(endLine, afterLines)
                    .map<LineContent>((
                        content,
                        i,
                    ) => [endLine + i + 1, content]),
            };
        }

        return {
            beforeContext: splitContent
                .slice(beforeLines - 1, startLine - 1)
                .map<LineContent>((content, i) => [beforeLines + i, content]),
            matchedLines: splitContent
                .slice(startLine - 1, endLine)
                .map<LineContent>((content, i) => [startLine + i, content]),
            afterContext: splitContent
                .slice(endLine, afterLines)
                .map<LineContent>((content, i) => [endLine + i + 1, content]),
        };
    });
};

export const formatLineContent = (
    lineNo: number,
    content: string,
    color = false,
    isContextLine = false,
): string =>
    `${color ? green(lineNo.toString()) : lineNo.toString()}${
        isContextLine ? '-' : ':'
    }${content}`;

export const formatMatchOutput = (
    relativePath: string,
    extracted: ExtractedLinesAndContext[],
    options: OXCGrepOptions,
): string =>
    [
        ...(options.printFilenames
            ? [
                options.color ? bold(magenta(relativePath)) : relativePath,
            ]
            : []),
        ...extracted
            .map(
                ({ beforeContext, matchedLines, afterContext }) =>
                    [
                        ...beforeContext.map(([lineNo, content]) =>
                            options.printLineNumbers
                                ? formatLineContent(
                                    lineNo,
                                    content,
                                    options.color,
                                    true,
                                )
                                : content
                        ),
                        ...matchedLines.map(([lineNo, content]) =>
                            options.printLineNumbers
                                ? formatLineContent(
                                    lineNo,
                                    content,
                                    options.color,
                                )
                                : content
                        ),
                        ...afterContext.map(([lineNo, content]) =>
                            options.printLineNumbers
                                ? formatLineContent(
                                    lineNo,
                                    content,
                                    options.color,
                                    true,
                                )
                                : content
                        ),
                    ].join('\n'),
            ),
    ].join('\n');
