package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The settings of the installation live in config.env, which is committed, so
// that they travel with the code to every machine. The secrets live in .env,
// which is ignored by git.
//
// A secret that ends up in the committed file is in every clone of the
// repository, in its history and in every mirror of it, and nothing removes
// it afterwards. The two files are therefore checked here: the committed one
// has to hold no secret, and the example has to hold placeholders only.

var secretVariables = map[string]bool{
	"WJ_ADMIN_PASSWORD": true,
	"OPENAI_API_KEY":    true,
	"POSTGRES_PASSWORD": true,
	"WJ_DATABASE_URL":   true,
}

// settingsOf reads an environment file and returns the assignments it holds.
// A comment and a blank line are skipped.
func settingsOf(t *testing.T, name string) map[string]string {
	t.Helper()

	path := filepath.Join("..", "..", "..", name)
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cannot read %s: %v", name, err)
	}

	out := map[string]string{}
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			t.Errorf("%s has a line that is not an assignment: %q", name, line)
			continue
		}
		key = strings.TrimSpace(key)
		if _, seen := out[key]; seen {
			t.Errorf("%s sets %s twice", name, key)
		}
		out[key] = strings.Trim(strings.TrimSpace(value), `"'`)
	}
	return out
}

func TestTheCommittedSettingsHoldNoSecret(t *testing.T) {
	settings := settingsOf(t, "config.env")

	if len(settings) == 0 {
		t.Fatal("config.env is empty")
	}
	for name, value := range settings {
		if secretVariables[name] && value != "" {
			t.Errorf("%s has a value in the committed settings file, it belongs in .env", name)
		}
	}
}

func TestTheExampleEnvironmentFileHoldsPlaceholdersOnly(t *testing.T) {
	settings := settingsOf(t, ".env.example")

	if len(settings) == 0 {
		t.Fatal(".env.example is empty")
	}
	for name, value := range settings {
		if secretVariables[name] && value != "" {
			t.Errorf("%s has a value in the example file, it has to stay a placeholder", name)
		}
	}
}

// A variable that is set in both files is ambiguous: the local one wins, but
// the committed one looks effective and is not.
func TestTheTwoFilesDoNotSetTheSameVariable(t *testing.T) {
	committed := settingsOf(t, "config.env")
	local := settingsOf(t, ".env.example")

	for name := range committed {
		if _, both := local[name]; both {
			t.Errorf("%s is set in config.env and in .env.example, it belongs to one of them", name)
		}
	}
}
