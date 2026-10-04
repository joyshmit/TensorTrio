var qout = []; 
var ostk = []; 
let exp = "-1.111+0.11";
var les = 0; 

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
for (let i = 0;i < qout.length; i++) {
	console.log(qout[i]); 
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
	if (err === 1) {
		console.log("cannot divide by 0"); 
	}else if (err === 2) {
		console.log("invalid statement"); 
	}
	switch(err) {
		case 1: 
			console.log("cannot divide by 0"); 
		break;
		case 2: 
			console.log("invalid statement"); 
		break;
		default: 
			console.log("the values should be real numbers");
		break;
	}
}else {
	console.log(cstak[0]);
}

