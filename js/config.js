
// This file contains the core configuration for connecting to Supabase.
// All other modules will import the supabaseClient from here.

const SUPABASE_URL = 'https://ryyiejjacfaxrfxeawcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eWllamphY2ZheHJmeGVhd2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2Njc5ODcsImV4cCI6MjA3NTI0Mzk4N30.4AwNsECeQnRRJtnoDldYjQuPoD6OfhkCtgTJ_VJSVc4';

const { createClient } = supabase;
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

#### **`js/state.js`**
*   **الوظيفة:** متغيرات عامة ومشتركة تحتاجها كل الوحدات (مثل من هو اللاعب الحالي).
```javascript
// This file holds the shared state of the application.
// Modules can import this state to get access to the current user and profile.

export const state = {
    currentUser: null,
    playerProfile: null,
};