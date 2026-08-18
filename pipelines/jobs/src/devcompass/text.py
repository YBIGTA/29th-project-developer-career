from html import unescape
from html.parser import HTMLParser
import re


class _PlainTextParser(HTMLParser):
    BLOCK_TAGS = {
        "br", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "tr"
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs) -> None:
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag) -> None:
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data) -> None:
        self.parts.append(data)


def html_to_text(value):
    if not value:
        return None
    parser = _PlainTextParser()
    parser.feed(unescape(str(value)))
    text = "".join(parser.parts).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line) or None

