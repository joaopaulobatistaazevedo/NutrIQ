from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SourceConfig:
    name: str
    list_urls: list[str]
    default_tags: list[str]
    sitemap_urls: list[str] = field(default_factory=list)


def default_sources() -> list[SourceConfig]:
    return [
        SourceConfig(
            name="TeleCulinaria",
            list_urls=[
                "https://www.teleculinaria.pt/todas-as-receitas/",
                "https://www.teleculinaria.pt/receitas/",
                "https://teleculinaria.pt/todas-as-receitas/",
                "https://teleculinaria.pt/receitas/",
            ],
            default_tags=["pt", "teleculinaria"],
            sitemap_urls=[
                "https://www.teleculinaria.pt/sitemap_index.xml",
                "https://www.teleculinaria.pt/sitemap.xml",
                "https://www.teleculinaria.pt/post-sitemap.xml",
                "https://teleculinaria.pt/sitemap_index.xml",
                "https://teleculinaria.pt/sitemap.xml",
                "https://teleculinaria.pt/post-sitemap.xml",
            ],
        ),
    ]
