import {createTheme} from 'thememirror';
import {tags as t} from '@lezer/highlight';

const zanyZoundsTheme = createTheme({
	variant: 'dark',
	settings: {
		background: '#282828',
		foreground: '#5cffda',
		caret: '#7c9100',
		selection: '#610000',
		lineHighlight: '#8a91991a',
		gutterBackground: '#fff',
		gutterForeground: '#8a919966',
	},
	styles: [
		{
			tag: t.comment,
			color: '#21c9ff',
		},
		{
			tag: t.variableName,
			color: '#66ffff',
		},
		{
			tag: [t.string, t.special(t.brace)],
			color: '#5d93ff',
		},
		{
			tag: t.number,
			color: '#5ced66',
		},
		{
			tag: t.bool,
			color: '#8aff66',
		},
		{
			tag: t.null,
			color: '#d5b666',
		},
		{
			tag: t.keyword,
			color: '#5c61ff',
		},
		{
			tag: t.operator,
			color: '#5cff66',
		},
		{
			tag: t.className,
			color: '#0cb922',
		},
		{
			tag: t.definition(t.typeName),
			color: '#a4ff66',
		},
		{
			tag: t.typeName,
			color: '#bb61ff',
		},
		{
			tag: t.angleBracket,
			color: '#00ffd5',
		},
		{
			tag: t.tagName,
			color: '#7e00ff',
		},
		{
			tag: t.attributeName,
			color: '#d0cf37',
		},
	],
});
