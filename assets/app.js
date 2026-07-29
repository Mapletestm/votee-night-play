(() => {
  'use strict';

  const PARK = Object.freeze({
    latitude: 40.89414,
    longitude: -74.01119,
    timezone: 'America/New_York'
  });

  const PLAY_HOURS = [20, 21, 22, 23];
  const WINDOW_DAYS = 7;

  const elements = {
    grid: document.getElementById('forecastGrid'),
    loading: document.getElementById('loadingState'),
    error: document.getElementById('errorState'),
    updated: document.getElementById('updatedText'),
    refresh: document.getElementById('refreshButton'),
    form: document.getElementById('voteForm'),
    firstName: document.getElementById('firstName'),
    lastName: document.getElementById('lastName'),
    nightOptions: document.getElementById('nightOptions'),
    voteButton: document.getElementById('voteButton'),
    formMessage: document.getElementById('formMessage')
  };

  let forecastDays = [];
  let voteCounts = {};
  let savedVotes = new Set();
  let draftVotes = new Set();
  let supabaseClient = null;
  let votingAvailable = false;
  let votingInitialized = false;

  function configuredForSupabase() {
    const config = window.VOTEE_CONFIG || {};
    return Boolean(
      config.SUPABASE_URL &&
      config.SUPABASE_PUBLISHABLE_KEY &&
      !config.SUPABASE_URL.includes('YOUR-PROJECT') &&
      !config.SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME')
    );
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
    })[character]);
  }

  function nyDateString(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: PARK.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function dateStringFromUtc(date) {
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
  }

  function eligibleDates() {
    const [year, month, day] = nyDateString().split('-').map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, day, 12));
    const dates = [];

    for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
      const candidate = new Date(anchor.getTime() + offset * 86400000);
      if (candidate.getUTCDay() === 5) continue; // Friday
      dates.push(dateStringFromUtc(candidate));
    }

    return dates;
  }

  function displayDate(dateString) {
    const date = new Date(`${dateString}T12:00:00Z`);
    return {
      dayName: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date),
      shortDate: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)
    };
  }

  function weatherDetails(code) {
    const definitions = {
      0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Cloudy', '☁️'],
      45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'],
      55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
      61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'],
      67: ['Freezing rain', '🌧️'], 71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'],
      77: ['Snow grains', '🌨️'], 80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Heavy showers', '⛈️'],
      85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'], 95: ['Thunderstorm', '⛈️'],
      96: ['Thunderstorm with hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️']
    };
    return definitions[Number(code)] || ['Weather unavailable', '🌡️'];
  }

  function hourLabel(hour) {
    return `${hour > 12 ? hour - 12 : hour} PM`;
  }

  function numberOrDash(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value)) : '–';
  }

  async function loadWeather() {
    const query = new URLSearchParams({
      latitude: String(PARK.latitude),
      longitude: String(PARK.longitude),
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      timezone: PARK.timezone,
      forecast_days: '8'
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('The weather service is temporarily unavailable.');

    const data = await response.json();
    if (!data.hourly || !Array.isArray(data.hourly.time)) {
      throw new Error('The weather service returned an unexpected response.');
    }

    const indexByTime = new Map(data.hourly.time.map((time, index) => [time, index]));
    forecastDays = eligibleDates().map(date => {
      const labels = displayDate(date);
      const hours = PLAY_HOURS.map(hour => {
        const index = indexByTime.get(`${date}T${String(hour).padStart(2, '0')}:00`);
        if (index === undefined) {
          return { time: hourLabel(hour), condition: 'Forecast unavailable', icon: '🌡️', temperature: '–', rainChance: '–', wind: '–' };
        }

        const [condition, icon] = weatherDetails(data.hourly.weather_code[index]);
        return {
          time: hourLabel(hour),
          condition,
          icon,
          temperature: numberOrDash(data.hourly.temperature_2m[index]),
          rainChance: numberOrDash(data.hourly.precipitation_probability[index]),
          wind: numberOrDash(data.hourly.wind_speed_10m[index])
        };
      });
      return { date, ...labels, hours };
    });
  }

  function friendlyVotingError(error) {
    const message = String(error?.message || 'Please check the Supabase setup.');
    if (/anonymous sign-?ins.*disabled/i.test(message)) {
      return 'Anonymous Sign-Ins must be enabled in Supabase Authentication settings.';
    }
    if (/function .* does not exist|schema cache/i.test(message)) {
      return 'The updated database.sql has not been run in Supabase yet.';
    }
    if (/failed to fetch|network/i.test(message)) {
      return 'The browser could not reach Supabase. Check the Project URL in config.js.';
    }
    return message;
  }

  async function initializeVoting() {
    if (votingInitialized) return;

    if (!configuredForSupabase()) {
      votingAvailable = false;
      elements.formMessage.textContent = 'Voting is not connected. The site owner must add the Supabase Project URL and Publishable key to config.js.';
      elements.formMessage.classList.add('warning');
      elements.voteButton.disabled = true;
      return;
    }

    if (!window.supabase?.createClient) {
      throw new Error('The voting service library could not be loaded.');
    }

    supabaseClient = window.supabase.createClient(
      window.VOTEE_CONFIG.SUPABASE_URL,
      window.VOTEE_CONFIG.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
    );

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;

    if (!sessionData.session) {
      const { error } = await supabaseClient.auth.signInAnonymously();
      if (error) throw error;
    }

    votingAvailable = true;
    votingInitialized = true;
    elements.voteButton.disabled = false;
  }

  async function loadVotes() {
    if (!votingAvailable || !supabaseClient) return;

    const [summaryResponse, submissionResponse] = await Promise.all([
      supabaseClient.rpc('get_vote_summary'),
      supabaseClient.rpc('get_my_submission')
    ]);

    if (summaryResponse.error) throw summaryResponse.error;
    if (submissionResponse.error) throw submissionResponse.error;

    voteCounts = Object.fromEntries(
      (summaryResponse.data || []).map(row => [row.event_date, Number(row.vote_count)])
    );

    const submission = Array.isArray(submissionResponse.data)
      ? submissionResponse.data[0]
      : submissionResponse.data;

    if (submission) {
      elements.firstName.value = submission.first_name || '';
      elements.lastName.value = submission.last_name || '';
      savedVotes = new Set(submission.event_dates || []);
      draftVotes = new Set(savedVotes);
    }
  }

  function pluralVotes(count) {
    return count === 1 ? 'vote' : 'votes';
  }

  function setDraftSelection(date, selected) {
    if (selected) draftVotes.add(date);
    else draftVotes.delete(date);
    render();
  }

  function renderNightOptions() {
    elements.nightOptions.innerHTML = forecastDays.map(day => {
      const checked = draftVotes.has(day.date);
      return `
        <label class="night-option ${checked ? 'checked' : ''}">
          <input type="checkbox" name="event_dates" value="${day.date}" ${checked ? 'checked' : ''} ${votingAvailable ? '' : 'disabled'}>
          <span class="night-check" aria-hidden="true">${checked ? '✓' : ''}</span>
          <span><strong>${escapeHtml(day.dayName)}</strong><small>${escapeHtml(day.shortDate)}</small></span>
        </label>
      `;
    }).join('');

    elements.nightOptions.querySelectorAll('input[name="event_dates"]').forEach(input => {
      input.addEventListener('change', () => setDraftSelection(input.value, input.checked));
    });
  }

  function render() {
    const maxVotes = Math.max(0, ...forecastDays.map(day => Number(voteCounts[day.date] || 0)));

    elements.grid.innerHTML = forecastDays.map(day => {
      const count = Number(voteCounts[day.date] || 0);
      const isLeading = maxVotes > 0 && count === maxVotes;
      const isSelected = draftVotes.has(day.date);
      const hours = day.hours.map(hour => `
        <div class="hour-row">
          <span class="hour-time">${escapeHtml(hour.time)}</span>
          <span class="hour-icon" title="${escapeHtml(hour.condition)}">${hour.icon}</span>
          <span class="hour-temp">${hour.temperature}°</span>
          <span class="hour-meta">🌧️ ${hour.rainChance}%<br>💨 ${hour.wind} mph</span>
        </div>
      `).join('');

      return `
        <article class="forecast-card ${isLeading ? 'leading' : ''} ${isSelected ? 'chosen' : ''}" data-date="${day.date}">
          ${isLeading ? '<span class="leading-badge">Most votes</span>' : ''}
          <div class="card-top">
            <div>
              <div class="day-name">${escapeHtml(day.dayName)}</div>
              <div class="date-label">${escapeHtml(day.shortDate)}</div>
            </div>
            <div class="vote-total" aria-label="${count} ${pluralVotes(count)}">
              <span class="vote-number">${count}</span>
              <span class="vote-label">${pluralVotes(count)}</span>
            </div>
          </div>
          <div class="hour-list">${hours}</div>
          <button class="card-action ${isSelected ? 'selected' : ''}" type="button" data-select-date="${day.date}" aria-pressed="${isSelected}" ${votingAvailable ? '' : 'disabled'}>
            ${isSelected ? '✓ Selected' : `Select ${escapeHtml(day.dayName)}`}
          </button>
        </article>
      `;
    }).join('');

    elements.grid.querySelectorAll('[data-select-date]').forEach(button => {
      button.addEventListener('click', () => {
        const date = button.dataset.selectDate;
        setDraftSelection(date, !draftVotes.has(date));
      });
    });

    renderNightOptions();
  }

  function showMainContent() {
    elements.loading.classList.add('hidden');
    elements.grid.classList.remove('hidden');
    elements.error.classList.add('hidden');
  }

  function showFatalError(message) {
    elements.loading.classList.add('hidden');
    elements.grid.classList.add('hidden');
    elements.error.textContent = message;
    elements.error.classList.remove('hidden');
  }

  async function loadAll() {
    elements.refresh.disabled = true;
    elements.updated.textContent = 'Refreshing evening forecast and votes…';

    try {
      await loadWeather();
      showMainContent();

      try {
        await initializeVoting();
        await loadVotes();
      } catch (votingError) {
        votingAvailable = false;
        elements.voteButton.disabled = true;
        elements.formMessage.textContent = `Voting is unavailable: ${friendlyVotingError(votingError)}`;
        elements.formMessage.classList.add('warning');
      }

      render();
      elements.updated.textContent = `Updated ${new Intl.DateTimeFormat('en-US', {
        timeZone: PARK.timezone,
        hour: 'numeric',
        minute: '2-digit'
      }).format(new Date())}`;
    } catch (error) {
      showFatalError(error.message || 'Unable to load the forecast.');
      elements.updated.textContent = 'Unable to load forecast';
    } finally {
      elements.refresh.disabled = false;
    }
  }

  async function refreshVotesOnly() {
    if (!votingAvailable || !supabaseClient || document.hidden) return;
    try {
      const response = await supabaseClient.rpc('get_vote_summary');
      if (response.error) throw response.error;
      voteCounts = Object.fromEntries(
        (response.data || []).map(row => [row.event_date, Number(row.vote_count)])
      );
      render();
    } catch (_) {
      // Keep the last visible totals when a background refresh fails.
    }
  }

  elements.form.addEventListener('submit', async event => {
    event.preventDefault();
    elements.formMessage.textContent = '';
    elements.formMessage.classList.remove('error', 'warning');

    if (!votingAvailable || !supabaseClient) {
      elements.formMessage.textContent = 'Voting is not connected yet.';
      elements.formMessage.classList.add('error');
      return;
    }

    const firstName = elements.firstName.value.trim();
    const lastName = elements.lastName.value.trim();
    const selectedDates = forecastDays
      .map(day => day.date)
      .filter(date => draftVotes.has(date));

    if (!firstName || !lastName) {
      elements.formMessage.textContent = 'Please enter your first and last name.';
      elements.formMessage.classList.add('error');
      return;
    }

    if (selectedDates.length < 1) {
      elements.formMessage.textContent = 'Please select at least one available night.';
      elements.formMessage.classList.add('error');
      return;
    }

    elements.voteButton.disabled = true;
    elements.voteButton.textContent = 'Saving…';

    try {
      const { data, error } = await supabaseClient.rpc('submit_availability', {
        p_first_name: firstName,
        p_last_name: lastName,
        p_event_dates: selectedDates
      });
      if (error) throw error;

      savedVotes = new Set(selectedDates);
      draftVotes = new Set(selectedDates);
      const savedAt = data ? new Date(data) : new Date();
      elements.formMessage.textContent = `Your availability was saved at ${new Intl.DateTimeFormat('en-US', {
        timeZone: PARK.timezone,
        hour: 'numeric',
        minute: '2-digit'
      }).format(savedAt)}.`;

      await loadVotes();
      render();
    } catch (error) {
      elements.formMessage.textContent = friendlyVotingError(error) || 'Unable to save your availability.';
      elements.formMessage.classList.add('error');
    } finally {
      elements.voteButton.disabled = !votingAvailable;
      elements.voteButton.textContent = 'Save my availability';
    }
  });

  elements.refresh.addEventListener('click', loadAll);
  document.addEventListener('visibilitychange', refreshVotesOnly);

  loadAll();
  window.setInterval(refreshVotesOnly, 30000);
})();
