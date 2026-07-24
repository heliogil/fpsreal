"""Ingestor de modelos visuais — descritor de APARÊNCIA por produto.

A dimensão vem sempre do motor de geometria; isto só descreve como a peça é
desenhada dentro da caixa em mm. Ver spec 2026-07-23.
"""
from .base import RawVisual, VisionAdapter
from .schema import DescriptorError, SCHEMA_VERSION, validate
from .specs_adapter import LLMVisionAdapter, SpecsAdapter

__all__ = ["RawVisual", "VisionAdapter", "DescriptorError", "SCHEMA_VERSION",
           "validate", "SpecsAdapter", "LLMVisionAdapter"]
