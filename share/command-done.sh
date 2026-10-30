# Nixi (#133): a "done" notification when a long command ends in a terminal you are not looking at.
# Only the command's FIRST WORD (its basename, after any NAME=value) and its duration are sent, never the line.
# Sourced by interactive bash and zsh (services.nixi.companion.commandDone in nix/hm-module.nix).
# NIXI_JOB_SECONDS: the shortest command that counts (default 30).
# Inside a multiplexer (herdr, tmux, zellij) the shell runs under its server, not the window: it cannot tell
# whether you are watching, so it always notifies there.
__nixi_job_min=${NIXI_JOB_SECONDS:-30}
__nixi_job_start=
__nixi_job_cmd=

__nixi_job_first() {            # the command's first word: no NAME=value, no path, nothing after it
  local line=$1 w
  while :; do
    line=${line#"${line%%[![:space:](\{!]*}"}                # leading blanks, a subshell "(", a group "{", "!"
    w=${line%%[[:space:];|&)]*}
    case $w in
      [A-Za-z_]*=*) line=${line#"$w"} ;;   # an assignment before the command: skip it, never send it
      *) break ;;
    esac
  done
  case $w in *=*) w= ;; esac
  __nixi_job_cmd=${w##*/}
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
  # No DEBUG trap (it hides other tools' traps from functions and clobbers $_): PS0 is expanded once, in this
  # shell, right before a command line runs and never for an empty one. The subscript assigns the start time
  # and the empty element prints nothing.
  __nixi_job_ps0='${__nixi_job_nil[__nixi_job_start=SECONDS,0]}'
  __nixi_job_hc=$HISTCMD
  __nixi_job_post() {
    local rc=$?
    [ -n "${__bp_last_ret_value+x}" ] && rc=$__bp_last_ret_value      # bash-preexec keeps the command's status
    case $PS0 in *__nixi_job_start*) ;; *) PS0+=$__nixi_job_ps0 ;; esac   # a later tool may have replaced PS0
    if [ -n "$__nixi_job_start" ] && [ $((SECONDS - __nixi_job_start)) -ge "$__nixi_job_min" ] \
       && [ "$HISTCMD" != "$__nixi_job_hc" ]; then                    # (only after a long command: this forks)
      __nixi_job_first "$(HISTTIMEFORMAT= history 1 2>/dev/null | { read -r _ l; printf '%s' "$l"; })"   # the line just run
    fi
    __nixi_job_hc=$HISTCMD
    __nixi_job_end "$rc"
  }
  PS0+=$__nixi_job_ps0
  case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in
    *__nixi_job_post*) ;;
    "declare -a"*) PROMPT_COMMAND=(__nixi_job_post "${PROMPT_COMMAND[@]}") ;;   # first: $? is still the command's
    *) PROMPT_COMMAND="__nixi_job_post${PROMPT_COMMAND:+; $PROMPT_COMMAND}" ;;
  esac
elif [ -n "${ZSH_VERSION:-}" ]; then
  __nixi_job_preexec() { __nixi_job_start=$SECONDS; __nixi_job_first "$1"; }
  __nixi_job_precmd() { __nixi_job_end $?; }
  autoload -Uz add-zsh-hook 2>/dev/null && {
    add-zsh-hook preexec __nixi_job_preexec
    add-zsh-hook precmd __nixi_job_precmd
  }
fi
