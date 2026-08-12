"""drop dead gltf cache columns

T-22: `model_gltf_path` e `model_generated_at` (component_footprints) foram
desenhadas para um plano de gerar o modelo 3D uma vez e guardar o caminho do
arquivo estático. Esse plano foi substituído pela rota `/interior/model.gltf`
(gltf_builder.py), que gera o glTF NA HORA a partir da mesma geometria em mm
da vista 2D — não há arquivo estático, não há cache, não há o que guardar
aqui. As duas colunas nunca foram escritas nem lidas em nenhum lugar do
código (grep confirmado antes de escrever esta migration). `dimensions_source`,
a coluna vizinha, FICA — essa é usada de verdade em seed/run_seed.py.

Revision ID: b1f4a9d02c17
Revises: 99c07a23d5e1
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b1f4a9d02c17'
down_revision: Union[str, None] = '99c07a23d5e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('component_footprints', 'model_gltf_path')
    op.drop_column('component_footprints', 'model_generated_at')


def downgrade() -> None:
    op.add_column('component_footprints', sa.Column('model_generated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('component_footprints', sa.Column('model_gltf_path', sa.Text(), nullable=True))
