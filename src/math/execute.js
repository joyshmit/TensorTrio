// Evaluates an arithmetic expression string (digits, + - * / ^ ( ) and ".") with BODMAS precedence.
// Returns { ok: true, value } or { ok: false, error, message } with a specific error type.
// Algorithm (unchanged): shunting-yard to postfix, then a stack evaluation. No eval(), no new Function().
// It is wrapped in a function so state cannot leak between calls, and results are returned instead of logged.
const ERRORS = {
  div0: 'Cannot divide by zero',
  syntax: 'Invalid statement: an operator is missing an operand',
  number: 'Invalid number',
  parens: 'Unbalanced parentheses',
  chars: 'Unsupported character',
  empty: 'Empty expression',
};
const fail = (error) => ({ ok: false, error, message: ERRORS[error] });

export function evaluate(expr) {
  try {
    var qout = [];
    var ostk = [];
    var les = 0;
    const exp = String(expr).replace(/\s+/g, '');

    // Input checks (added): reject input the algorithm below cannot handle safely.
    if (exp === '') return fail('empty');
    if (/[^0-9+\-*\/^().]/.test(exp)) return fail('chars');
    let depth = 0;
    for (const ch of exp) {
      if (ch === '(') depth++;
      else if (ch === ')' && --depth < 0) return fail('parens');
    }
    if (depth !== 0) return fail('parens');

    const order = new Map([
    	['(', 0],
    	['-', 1],
    	['+', 1], 
    	['*', 3], 
    	['/', 3], 
    	['^', 5], 
    	['~', 6]
    ]); 

    var pos = true, err = 0;
    for (let i = 0; i < exp.length; i++) {
    	if ((0 <= exp[i] - '0' && exp[i]-'0' <= 9)) {
    		if (les == 0) qout.push((exp[i] - '0').toString()); 
    		else qout[qout.length-1] += (exp[i] - '0').toString(); 
    		les += 1; 
    	} else if (exp[i] === '.') {
    		if (i-1 >= 0 && exp[i-1] === '.') {
    			pos = 0; 
    			err = 3;
    			break;
    		}
    		qout[qout.length-1] += '.';  
    		les+=1;  
    	} else if (exp[i] === '(') {
    		ostk.push(exp[i]); 
    		les = 0; 
    	} else if (exp[i] === ')') {
    		les = 0; 
    		while(ostk.length > 0 && ostk[ostk.length-1] !== '(') {
    			qout.push(ostk.pop()); 
    		}
    		ostk.pop(); 
    	} else {
    		let op = exp[i]; 
    		if (exp[i] === '-' && (i === 0 || "(+-*/^".includes(exp[i-1]))) {
    			op = "~";
    			ostk.push(op);  
    			continue;
    		}
    		while (ostk.length > 0 && order.get(ostk[ostk.length-1]) >= order.get(op)) {
    			qout.push(ostk.pop()); 
    		}
    		ostk.push(op);
    		les = 0; 
    	}
    }

    while (ostk.length > 0) {
    	qout.push(ostk.pop()); 
    }

    var cstak = []; 
    for (let i =0 ;i < qout.length; i++){
    	if (!pos) break;
    	var a, b; 
    	if ("^/*-+".includes(qout[i])) {
    		if (cstak.length < 2) {
    			pos = 0; 
    			err = 2; 
    			break;
    		}
    		a = cstak.pop(); 
    		b = cstak.pop(); 
    	}else if (qout[i] === '~') {
    		if (cstak.length < 1) {
    			pos = 0; 
    			err = 2; 
    			break;
    		}
    		a = cstak.pop(); 
    	}
    	if (qout[i] === '^'){
    		cstak.push(b**a); 
    	}else if (qout[i] === '/'){
    		if (a == 0) {
    			pos = 0; 
    			err = 1; 
    			break; 
    		}
    		cstak.push(b/a);
    	}else if (qout[i] === '*'){
    		cstak.push(a*b);
    	}else if (qout[i] === '+'){
    		cstak.push(a+b); 
    	}else if (qout[i] == '-') {
    		cstak.push(b-a);   
    	}else if (qout[i] === '~') {
    		cstak.push(-a); 
    	}else {
    		cstak.push(Number(qout[i]));
    	}
    }


    if (!pos) {
      return fail(err === 1 ? 'div0' : err === 2 ? 'syntax' : 'number');
    }
    if (cstak.length !== 1) return fail('syntax');
    const value = cstak[0];
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail('number');
    return { ok: true, value };
  } catch (e) {
    return fail('syntax');
  }
}
