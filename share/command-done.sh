# Nixi (#133): a "done" notification when a long command ends in a terminal you are not looking at.
# Only the command's FIRST WORD and its duration are sent, never the command line.
# Sourced by interactive bash and zsh (services.nixi.companion.commandDone in nix/hm-module.nix).
# NIXI_JOB_SECONDS: the shortest command that counts (default 30).
__nixi_job_min=${NIXI_JOB_SECONDS:-30}
__nixi_job_start=
__nixi_job_cmd=

__nixi_job_first() {            # the first word of a command line, and nothing else
  __nixi_job_cmd=$1
  __nixi_job_cmd=${__nixi_job_cmd#"${__nixi_job_cmd%%[![:space:]]*}"}
  __nixi_job_cmd=${__nixi_job_cmd%%[[:space:]]*}
}

__nixi_job_focused() {          # is this terminal the focused Hyprland window? Forks only after a long command.
  command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 || return 1
  local win p n=0
  win=$(hyprctl activewindow -j 2>/dev/null | jq -r '.pid // empty' 2>/dev/null)
  case $win in ''|*[!0-9]*) return 1 ;; esac
  p=$$
  while [ "$n" -lt 16 ] && [ "$p" -gt 1 ]; do                 # this shell's parents, up to the terminal
    [ "$p" = "$win" ] && return 0
    p=$(awk -v RS=')' 'END{print $2}' "/proc/$p/stat" 2>/dev/null)
    case $p in ''|*[!0-9]*) return 1 ;; esac
    n=$((n + 1))
  done
  return 1
}

__nixi_job_done() {             # seconds exit-status first-word
  command -v notify-send >/dev/null 2>&1 || return 0
  __nixi_job_focused && return 0
  if [ "$2" = 0 ]; then
    notify-send -a nixi-job -- "Done in ${1}s" "$3"
  else
    notify-send -a nixi-job -- "Failed after ${1}s (exit $2)" "$3"
  fi
}

__nixi_job_end() {              # exit-status: called when the prompt comes back
  local rc=$1 start=$__nixi_job_start cmd=$__nixi_job_cmd
  __nixi_job_start=
  __nixi_job_cmd=
  if [ -n "$start" ] && [ $((SECONDS - start)) -ge "$__nixi_job_min" ]; then
    __nixi_job_done $((SECONDS - start)) "$rc" "$cmd"
  fi
  return "$rc"
}

if [ -n "${BASH_VERSION:-}" ]; then
  # DEBUG fires for every simple command: only the first of a command line counts, so a pipeline is one.
  __nixi_job_pre() { if [ -z "$__nixi_job_start" ]; then __nixi_job_start=$SECONDS; __nixi_job_first "$BASH_COMMAND"; fi; }
  __nixi_job_fresh=1            # the rest of the startup file runs under the trap: the first prompt only starts the count
  __nixi_job_post() {
    local rc=$?
    if [ -n "$__nixi_job_fresh" ]; then __nixi_job_fresh=; __nixi_job_start=; __nixi_job_cmd=; return "$rc"; fi
    __nixi_job_end "$rc"
  }
  __nixi_job_chain() {          # keep a DEBUG trap somebody else already set
    local cur
    cur=$(trap -p DEBUG)
    case $cur in
      *__nixi_job_pre*) ;;
      '') trap '__nixi_job_pre' DEBUG ;;
      *) eval "set -- $cur"; trap "__nixi_job_pre; $3" DEBUG ;;
    esac
  }
  __nixi_job_chain
  case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in
    *__nixi_job_post*) ;;
    "declare -a"*) PROMPT_COMMAND+=(__nixi_job_post) ;;
    *) PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND; }__nixi_job_post" ;;
  esac
elif [ -n "${ZSH_VERSION:-}" ]; then
  __nixi_job_preexec() { __nixi_job_start=$SECONDS; __nixi_job_first "$1"; }
  __nixi_job_precmd() { __nixi_job_end $?; }
  autoload -Uz add-zsh-hook 2>/dev/null && {
    add-zsh-hook preexec __nixi_job_preexec
    add-zsh-hook precmd __nixi_job_precmd
  }
fi
