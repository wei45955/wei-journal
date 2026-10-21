package api

import (
	"testing"
	"time"
)

func TestComputeStreaksUsesTheReadersCalendar(t *testing.T) {
	// The reader is in Shanghai, where it is already the 22nd, while UTC
	// is still on the evening of the 21st. The entry written on the 22nd
	// must count as today, not as the future.
	shanghai, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatalf("load zone: %v", err)
	}
	now := time.Date(2026, 10, 21, 17, 0, 0, 0, time.UTC).In(shanghai)

	tests := []struct {
		name    string
		dates   []string
		current int
		longest int
	}{
		{
			name:    "today in a zone ahead of UTC",
			dates:   []string{"2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"},
			current: 4,
			longest: 4,
		},
		{
			name:    "a run that ended yesterday still counts",
			dates:   []string{"2026-10-19", "2026-10-20", "2026-10-21"},
			current: 3,
			longest: 3,
		},
		{
			name:    "a run that ended two days ago is over",
			dates:   []string{"2026-10-18", "2026-10-19", "2026-10-20"},
			current: 0,
			longest: 3,
		},
		{
			name:    "the longest run is kept apart from the current one",
			dates:   []string{"2026-10-01", "2026-10-02", "2026-10-03", "2026-10-21"},
			current: 1,
			longest: 3,
		},
		{
			name:    "a future entry does not hide the run that reaches today",
			dates:   []string{"2026-10-20", "2026-10-21", "2026-10-22", "2026-10-25"},
			current: 3,
			longest: 3,
		},
		{
			name:    "no entries",
			dates:   nil,
			current: 0,
			longest: 0,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			current, longest := computeStreaks(test.dates, now)
			if current != test.current || longest != test.longest {
				t.Fatalf("computeStreaks(%v) = %d, %d; want %d, %d",
					test.dates, current, longest, test.current, test.longest)
			}
		})
	}
}
