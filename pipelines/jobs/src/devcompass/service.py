from .collectors import CollectorError, create_collector


def collect_board(run_id, board, repository, http_client=None):
    collector = create_collector(board.ats_source, http_client=http_client)
    try:
        payload = collector.collect(board.board_slug)
        if not payload.jobs:
            raise CollectorError(
                "Empty successful response for {}:{}; closed detection blocked".format(
                    board.ats_source, board.board_slug
                ),
                http_status=payload.http_status,
                elapsed_sec=payload.elapsed_sec,
            )
        return repository.write_success(
            run_id=run_id,
            board=board,
            jobs=payload.jobs,
            http_status=payload.http_status,
            elapsed_sec=payload.elapsed_sec,
        )
    except Exception as exc:
        repository.write_failure(
            run_id=run_id,
            board=board,
            error_message=str(exc),
            http_status=getattr(exc, "http_status", None),
            elapsed_sec=getattr(exc, "elapsed_sec", None),
        )
        raise
