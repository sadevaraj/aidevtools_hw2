from __future__ import annotations

from pathlib import Path

from sqlalchemy import delete, inspect, select

from app.database import create_database_engine, create_session_factory, init_database
from app.models import Project, Task, TaskStatus


def sqlite_file_url(db_path: Path) -> str:
    return f"sqlite:///{db_path}"


def test_schema_creation_creates_projects_and_tasks_tables(tmp_path):
    database_file = tmp_path / "foundation.db"
    engine = create_database_engine(sqlite_file_url(database_file))

    try:
        init_database(engine)

        tables = set(inspect(engine).get_table_names())
        assert {"projects", "tasks"}.issubset(tables)
    finally:
        engine.dispose()


def test_records_persist_across_engine_instances(tmp_path):
    database_file = tmp_path / "persisted.db"
    database_url = sqlite_file_url(database_file)

    first_engine = create_database_engine(database_url)
    try:
        init_database(first_engine)
        FirstSession = create_session_factory(first_engine)

        with FirstSession() as session:
            session.add(
                Project(
                    id="project-1",
                    name="Project 1",
                    position=0,
                    hidden=False,
                )
            )
            session.add(
                Task(
                    id="task-1",
                    project_id="project-1",
                    title="Task 1",
                    assignee="Casey",
                    notes="Initial task notes",
                    status=TaskStatus.TODO,
                    position=0,
                )
            )
            session.commit()
    finally:
        first_engine.dispose()

    second_engine = create_database_engine(database_url)
    try:
        SecondSession = create_session_factory(second_engine)

        with SecondSession() as session:
            project = session.get(Project, "project-1")
            task = session.scalar(select(Task).where(Task.id == "task-1"))

            assert project is not None
            assert project.name == "Project 1"
            assert task is not None
            assert task.project_id == "project-1"
            assert task.title == "Task 1"
            assert task.assignee == "Casey"
            assert task.notes == "Initial task notes"
            assert task.status == TaskStatus.TODO
    finally:
        second_engine.dispose()


def test_deleting_project_cascades_to_tasks(tmp_path):
    database_file = tmp_path / "cascade.db"
    engine = create_database_engine(sqlite_file_url(database_file))

    try:
        init_database(engine)
        Session = create_session_factory(engine)

        with Session() as session:
            session.add(
                Project(
                    id="project-1",
                    name="Project 1",
                    position=0,
                    hidden=False,
                )
            )
            session.add(
                Task(
                    id="task-1",
                    project_id="project-1",
                    title="Task 1",
                    assignee="Casey",
                    notes="Initial task notes",
                    status=TaskStatus.DOING,
                    position=0,
                )
            )
            session.commit()

            session.execute(delete(Project).where(Project.id == "project-1"))
            session.commit()

        with Session() as session:
            assert session.get(Project, "project-1") is None
            assert session.get(Task, "task-1") is None
    finally:
        engine.dispose()
