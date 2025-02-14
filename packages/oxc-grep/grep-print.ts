import { bold, brightRed, green, magenta } from 'jsr:@std/fmt@1.0.5/colors';
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

export const highlightMatchedRanges = (
    content: string,
    ranges: TextRange[],
): string =>
    ranges.length === 0 || !content
        ? content
        : mergeRanges(ranges).reduceRight((acc, [start, end]) => {
            const before = acc.slice(0, start);
            const highlighted = acc.slice(start, end).replace(
                /^(\s*)(.*?)(\s*)$/,
                (_, leading: string, content: string, trailing: string) =>
                    leading + bold(brightRed(content)) + trailing,
            );
            const after = acc.slice(end);

            return before + highlighted + after;
        }, content);

export const extractLinesAndContext = (
    content: string,
    ranges: TextRange[],
    { beforeContext, afterContext, color }: Pick<
        OXCGrepOptions,
        'beforeContext' | 'afterContext' | 'color'
    >,
): ExtractedLinesAndContext[] => {
    const mergedRanges = mergeRanges(ranges);
    const highlightedContent = color
        ? highlightMatchedRanges(content, mergedRanges)
        : content;
    const splitContent = highlightedContent.split(/\r?\n/);

    return mergedRanges.map((range) => {
        const lineIndices = getLineIndices(content);
        const startLine = getLineForIndex(lineIndices, range[0]) ?? 1;
        const endLine = getLineForIndex(lineIndices, range[1]) ??
            lineIndices.at(-1)?.lineNo ?? 1;

        const beforeLines = Math.max(0, startLine - beforeContext);
        const afterLines = Math.min(
            splitContent.length,
            endLine + afterContext,
        );

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
