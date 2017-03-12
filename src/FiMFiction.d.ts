declare class PopUpMenu {
	constructor(id: string, caption: string);
	SetFixed(value: boolean);
	SetDimmerEnabled(value: boolean);
	SetSoftClose(value: boolean);
	SetCloseOnLinkPressed(value: boolean);
	SetCloseOnHoverOut(value: boolean);
	Close();
	SetContent(content: string | HTMLElement);
	SetFooter(content: string);
	SetWidth(value: string);
	SetPosition(x: number, y: number);
	Show(x?: number, y?: number);
}

declare function ShowErrorWindow(message: string): void;
